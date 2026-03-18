import os
import shutil
import zipfile

# Ensure we use the exact original contents
with open("original_ui.js", "r", encoding="utf-8") as f:
    ui = f.read()

# I want to make sure I get the absolute pristine index.html
# We know it should be 15683 bytes. Let's read it.
with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Let's fix index.html
if "tabulator-tables" not in html:
    tabulator_cdn = '<script type="text/javascript" src="https://unpkg.com/tabulator-tables@6.2.1/dist/js/tabulator.min.js"></script>\n'
    html = html.replace('</head>', tabulator_cdn + '</head>')

if "Tabulator Dark Theme Overrides" not in html:
    dark_css = """
<style>
/* Tabulator Dark Theme Overrides */
.tabulator { background-color: #0a0a1a !important; border: 1px solid #444 !important; color: #fff !important; }
.tabulator-header { background-color: #1a1a2a !important; color: #fff !important; border-bottom: 1px solid #444 !important; }
.tabulator-row { background-color: #0a0a1a !important; border-bottom: 1px solid #333 !important; }
.tabulator-row:nth-child(even) { background-color: #111122 !important; }
.tabulator-row.tabulator-selected { background-color: #2e1c1c !important; }
.tabulator-row:hover { background-color: #223 !important; }
.tabulator-cell { border-right: 1px solid #333 !important; padding: 4px !important; }
.tabulator-col { background-color: #1a1a2a !important; border-right: 1px solid #444 !important; }
.tabulator-col-title { color: #ccc !important; font-size: 14px; }
.tabulator-edit-list { background: #1a1a2a !important; color: #fff !important; border: 1px solid #555 !important; }
.tabulator-edit-list-item { padding: 4px !important; }
.tabulator-edit-list-item:hover { background: #334 !important; }
.tabulator-edit-list-item.active { background: #446 !important; }
</style>
"""
    html = html.replace('</head>', dark_css + '</head>')

if "btn-duplicate-col-action" not in html:
    btn_dup_col = '<button id="btn-duplicate-col-action" style="padding:8px 16px; border-radius:6px; border:1px solid #a8f; background:rgba(160,80,200,0.3); color:#eaf; cursor:pointer;">Dup Col</button>'
    html = html.replace('Duplicate (^D)</button>', 'Duplicate (^D)</button>\n          ' + btn_dup_col)


# Let's fix ui.js
start_idx = ui.find("window.renderTableEditor = function() {")
end_idx = ui.find("window.toggleRowSelect = function(idx, state)", start_idx)

tabulator_impl = """window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if(!container) return;
  if(typeof tableKeys === 'undefined' || tableKeys.length===0) initTableKeys();
  
  // Clear the original custom container
  container.innerHTML = '';

  // Setup columns based on tableKeys
  const cols = tableKeys.map(k => {
      let colDef = { 
          title: k, 
          field: k, 
          editor: "input",
          headerSort: true
      };
      
      // Dropdown autocomplete for specific columns
      if (k === 'cname' || k === 'v.author') {
          const uniqueValues = [...new Set(linksData.map(r => r[k]).filter(x => x))].sort();
          colDef.editor = "list";
          colDef.editorParams = {
              values: uniqueValues,
              autocomplete: true,
              freetext: true,
              listOnEmpty: true
          };
      }
      return colDef;
  });

  // Destroy previous instance if it exists
  if (window.tabulatorTable) {
      window.tabulatorTable.destroy();
  }

  // Initialize Tabulator
  window.tabulatorTable = new Tabulator(container, {
      data: linksData,
      reactiveData: true, // Automatically keeps linksData in sync with table edits
      layout: "fitData",
      columns: cols,
      selectableRows: true, // v6 syntax
      history: true,
  });

  // Wire up Top Buttons
  
  // 1. Add Row
  const btnAdd = document.getElementById('addTableItem');
  if(btnAdd) {
      btnAdd.onclick = () => {
          const newRow = {};
          tableKeys.forEach(k => newRow[k] = '');
          window.tabulatorTable.addRow(newRow, true);
      };
  }

  // 2. Duplicate Row
  const btnDupRow = document.getElementById('btn-duplicate-row-action');
  if(btnDupRow) {
      btnDupRow.onclick = () => {
          const selectedRows = window.tabulatorTable.getSelectedRows();
          if(selectedRows.length > 0) {
              selectedRows.forEach(row => {
                  const data = Object.assign({}, row.getData());
                  if(window.getFirstEmptyCell) {
                      data.cell = window.getFirstEmptyCell(); // Match original logic if possible
                  }
                  window.tabulatorTable.addRow(data, false, row);
              });
          } else {
              // Try falling back to old active row if none checked, or alert
              if (window.duplicateActiveRow) {
                  window.duplicateActiveRow();
              } else {
                  alert("Select a row to duplicate first.");
              }
          }
      };
  }

  // 3. Duplicate Column
  const btnDupCol = document.getElementById('btn-duplicate-col-action');
  if(btnDupCol) {
      btnDupCol.onclick = () => {
          const colToDup = prompt("Enter the name of the column to duplicate:");
          if(colToDup && tableKeys.includes(colToDup)) {
              let newColName = colToDup + '_copy';
              let counter = 1;
              while(tableKeys.includes(newColName)) {
                  counter++;
                  newColName = colToDup + '_copy' + counter;
              }
              tableKeys.push(newColName);
              
              // Apply data
              const allData = window.tabulatorTable.getData();
              allData.forEach(row => {
                  row[newColName] = row[colToDup];
              });
              
              // Full redraw required to pick up new tableKeys mapping
              window.renderTableEditor();
          } else if (colToDup) {
              alert("Column not found.");
          }
      };
  }

  // 4. Delete Selected
  const btnDel = document.getElementById('deleteSelectedRows');
  if(btnDel) {
      btnDel.style.display = 'inline-block'; // Ensure it's visible with Tabulator
      btnDel.onclick = () => {
          const selectedRows = window.tabulatorTable.getSelectedRows();
          if(selectedRows.length > 0) {
              if(confirm(`Delete ${selectedRows.length} selected rows?`)) {
                  selectedRows.forEach(row => row.delete());
              }
          } else {
              alert("Select rows to delete first.");
          }
      };
  }
};

"""

new_ui = ui[:start_idx] + tabulator_impl + ui[end_idx:]

os.makedirs("build", exist_ok=True)
with open("build/index.html", "w", encoding="utf-8") as f:
    f.write(html)
with open("build/ui.js", "w", encoding="utf-8") as f:
    f.write(new_ui)

files_to_copy = ["editor.js", "github.js", "globals.js", "grid.js", "links.json", "README.md", "main.js", "video.js"]
for file in files_to_copy:
    if os.path.exists(file):
        shutil.copy(file, f"build/{file}")
    else:
        print(f"Missing {file}!")

# Zip them up
with zipfile.ZipFile("zip51.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for file in os.listdir("build"):
        z.write(os.path.join("build", file), arcname=file)

print("Created zip51.zip. File size:", os.path.getsize("zip51.zip"))
