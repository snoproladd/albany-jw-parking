import os
import base64
import json
import zipfile

# ✅ Use the current directory as the website folder
website_folder = os.path.dirname(os.path.abspath(__file__))
output_zip = "website_package.zip"
output_json = "website_package.json"

# ✅ Load .gitignore patterns if present
ignore_patterns = []
gitignore_path = os.path.join(website_folder, ".gitignore")
if os.path.exists(gitignore_path):
    with open(gitignore_path, "r") as f:
        ignore_patterns = [line.strip() for line in f if line.strip() and not line.startswith("#")]

# ✅ Always ignore common large folders
ignore_patterns += ["venv", ".git", "node_modules", "__pycache__"]

def should_ignore(path):
    for pattern in ignore_patterns:
        if pattern in path:
            return True
    return False

# ✅ Step 1: Zip the entire website folder with LZMA compression
def zip_website(folder_path, zip_path):
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_LZMA) as zipf:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, folder_path)

                # Skip the zip file itself and ignored patterns
                if file == os.path.basename(zip_path) or should_ignore(rel_path):
                    continue

                zipf.write(file_path, rel_path)
    print(f"✅ Website zipped into: {zip_path} (LZMA compression)")

# ✅ Step 2: Convert zip file to Base64 and save as JSON
def save_as_json(zip_path, json_path):
    with open(zip_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    json_data = {
        "filename": os.path.basename(zip_path),
        "content": encoded
    }
    with open(json_path, "w") as json_file:
        json.dump(json_data, json_file)
    print(f"✅ JSON saved as: {json_path}")

# ✅ Run the steps
zip_website(website_folder, output_zip)
save_as_json(output_zip, output_json)