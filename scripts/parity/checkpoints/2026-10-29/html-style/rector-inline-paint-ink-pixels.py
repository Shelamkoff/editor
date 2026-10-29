import json
import math
from PIL import Image

source = '/tmp/rector-inline-paint-ink-control.json'
data = json.load(open(source))
rows = []
for observation in data['observations']:
    image = Image.open(observation['screenshot']).convert('RGB')
    box = observation['actual']['field']
    points = []
    for y in range(max(0, math.floor(box['top'] - 25)), min(image.height, math.ceil(box['bottom'] + 25))):
        for x in range(max(0, math.floor(box['left'] - 45)), min(image.width, math.ceil(box['right'] + 10))):
            red, green, blue = image.getpixel((x, y))
            if red > 170 and green < 70 and blue < 70:
                points.append((x, y))
    rows.append({
        'surface': observation['surface'],
        'field': box,
        'css': observation['actual']['css'],
        'redInkPixels': len(points),
        'redInkLeftOfField': sum(x < box['left'] for x, y in points),
        'inkBounds': [min(x for x, y in points), min(y for x, y in points),
                      max(x for x, y in points), max(y for x, y in points)] if points else None,
        'errors': observation['errors'],
    })
print(json.dumps({
    'source': source,
    'analysis': 'Pixel threshold R>170 G<70 B<70; original screenshots are not edited.',
    'results': rows,
}, indent=2))
