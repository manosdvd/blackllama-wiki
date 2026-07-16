import re
import os

def remove_images():
    file_path = 'staffHandbookWiki.md'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match standard markdown image syntax: ![alt text](url)
    # We also handle leading spaces if any
    pattern = r'!\[.*?\]\(.*?\)'
    
    # Replace image syntax with empty string
    clean_content = re.sub(pattern, '', content)

    # Let's clean up lines that contain only whitespace/newlines after removal
    lines = clean_content.split('\n')
    cleaned_lines = []
    for line in lines:
        # If the line was an image, it might now be empty or only spaces.
        # But we want to preserve paragraph spacing, so we only remove lines that
        # were specifically image-only lines.
        # An image-only line would have been completely cleared by the regex.
        # Let's check if the original line had an image and now is empty.
        cleaned_lines.append(line)

    final_content = '\n'.join(cleaned_lines)

    # Save clean file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(final_content)

    print("Successfully removed all images from staffHandbookWiki.md")

if __name__ == '__main__':
    remove_images()
