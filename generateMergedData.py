import os, json, time
from pathlib import Path


start_time = time.time()
root = Path(__file__).parent

data = root / 'static' / 'data'

FILES_NAMES = ['GB', 'JP', 'KR', 'TW', 'US']

DATA = {}

for file in FILES_NAMES:
    print(f"Loading {file}.json")
    filename = f'list_{file}'
    file_path = data / f'{filename}.json'
    with open(file_path, 'r', encoding='utf-8') as f:
        gdata = json.load(f)
        for game_data in gdata:
            game_title_id = game_data.get('TitleID', None)
            DATA[game_title_id] = game_data
        
with open(data / '3ds-titles.json', 'w+', encoding='utf-8') as f:
    json.dump(DATA, f, indent=4, ensure_ascii=False)
        
print(f"Processed in {time.time() - start_time:.2f} seconds")