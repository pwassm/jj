with open("build/ui.js", "r", encoding="utf-8") as f:
    u = f.read()

print("Does ui.js contain toggleRowSelect?", "window.toggleRowSelect = function" in u)
print("Does ui.js contain renderTableEditor?", "window.renderTableEditor = function" in u)
print("Does ui.js contain syncFit?", "function syncFit(" in u)

with open("build/index.html", "r", encoding="utf-8") as f:
    h = f.read()
    
print("Does index.html contain unpkg?", "unpkg.com" in h)
