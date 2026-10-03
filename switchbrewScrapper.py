import requests
from bs4 import BeautifulSoup
import json
import re

URL = "https://switchbrew.org/w/index.php?title=Title_list/Games"

def scrape_switchbrew():
    resp = requests.get(URL, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    titles = {}
    tables = soup.find_all("table", class_="wikitable")
    if not tables:
        print("No wikitable found — the page layout may have changed.")
        return titles

    for table in tables:
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            tid = cells[0].get_text(strip=True)
            # Some cells contain <br> or multiple names — take the first line
            name = cells[1].get_text(" ", strip=True)

            # Normalize / validate
            tid = tid.upper().strip()
            if not re.fullmatch(r"[0-9A-F]{16}", tid):
                continue
            if not name or name.lower() in ("title", "description"):
                continue

            # Publisher is usually the 3rd–5th cell; scan for a plausible one
            publisher = ""
            for cell in cells[2:6]:
                txt = cell.get_text(strip=True)
                if txt and not txt.isdigit() and len(txt) < 60:
                    publisher = txt
                    break

            titles[tid] = {"name": name, "publisher": publisher}

    return titles

if __name__ == "__main__":
    data = scrape_switchbrew()
    print(f"Scraped {len(data)} titles")
    with open("static/data/switch-titles.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Wrote static/data/switch-titles.json")