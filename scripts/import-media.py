"""Download public catalogue photos and convert them into optimized local WebP files."""
import json,re,urllib.request,concurrent.futures,io,pathlib
from PIL import Image,ImageOps
root=pathlib.Path(__file__).resolve().parents[1]
source=(root/'catalog.js').read_text(encoding='utf-8')
urls=set()
for key in ['CATALOG','FLAVORS']:
 for p in json.loads(re.search(r'window\.'+key+r'=(.*);',source).group(1)):
  urls.update(p['images'])
urls.add('https://amorasloves.com/wp-content/uploads/2025/02/favicon-4-100x100.png')
folder=root/'assets'/'original';folder.mkdir(parents=True,exist_ok=True)
def download(url):
 import hashlib
 name=hashlib.sha256(url.encode()).hexdigest()[:20]+'.webp'
 target=folder/name
 if not target.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(request,timeout=25) as r: data=r.read(20_000_000)
  with Image.open(io.BytesIO(data)) as im:
   im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((1200,1200));im.save(target,'WEBP',quality=85,method=6)
 return url,'assets/original/'+name
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 mapping=dict(pool.map(download,sorted(urls)))
for remote,local in mapping.items(): source=source.replace(remote,local)
(root/'catalog.js').write_text(source,encoding='utf-8')
html=root/'index.html';html.write_text(html.read_text(encoding='utf-8').replace('https://amorasloves.com/wp-content/uploads/2025/02/favicon-4-100x100.png',mapping['https://amorasloves.com/wp-content/uploads/2025/02/favicon-4-100x100.png']),encoding='utf-8')
print('Saved',len(mapping),'local WebP files')
