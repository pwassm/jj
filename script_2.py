import os
for f in os.listdir("build"):
    print(f"{f}: {os.path.getsize('build/' + f)} bytes")
