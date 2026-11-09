"""One-time catalog asset generation; not used by the running application."""
import concurrent.futures
import io
import pathlib
import urllib.parse
import urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).parent / "public" / "recipes"
DISHES = {
    "egg-skillet": "spinach, chopped tomatoes and fully cooked scrambled eggs in a ceramic skillet",
    "chicken-rice": "lemon chicken, steamed broccoli and brown rice in a white bowl",
    "yogurt-bowl": "sliced banana, Greek yogurt and rolled oats in a breakfast bowl",
    "vegetable-rice": "steamed broccoli, chopped tomatoes and brown rice in a ceramic bowl",
    "tomato-pasta": "penne pasta tossed with a simple cooked tomato sauce, no cheese",
    "tofu-broccoli": "cubes of tofu with broccoli in a stir fry pan, no sauce or garnish",
    "mushroom-eggs": "scrambled eggs with sliced cooked mushrooms on a white plate",
    "potato-carrot": "roasted potato chunks and carrots on a ceramic serving plate",
    "lentil-tomato": "a rustic bowl of red lentil and tomato soup, no garnish",
    "bean-salad": "cooked white beans and chopped fresh tomatoes in a salad bowl, no garnish",
    "salmon-rice": "cooked salmon fillet over rice in a white bowl, no garnish",
    "egg-toast": "fully cooked eggs on toasted bread on a small ceramic plate",
    "cucumber-salad": "sliced cucumbers and chopped tomatoes in a fresh salad bowl, no garnish",
    "porridge": "warm oatmeal made with water topped with sliced banana",
    "fruit-plate": "sliced apples, bananas and oranges on a simple fruit plate",
    "steamed-broccoli": "freshly steamed broccoli florets on a ceramic plate, no garnish",
    "kitchen-ingredients": "an editorial still life of a few fresh vegetables and dry grains on a kitchen counter, no prepared dish",
}

def generate(entry):
    key, scene = entry
    target = ROOT / f"{key}.webp"
    if target.exists() and Image.open(target).width > Image.open(target).height:
        return key, target.stat().st_size
    prompt = f"Realistic editorial food photograph of {scene}, three quarter overhead view, natural window light, warm cream background, handmade ceramics, restrained food styling, appetizing, high detail, no text, no watermark"
    url = "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?" + urllib.parse.urlencode({"prompt": prompt, "image_size": "landscape_4_3"}, quote_via=urllib.parse.quote)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-cache"}), timeout=180) as response:
        image = Image.open(io.BytesIO(response.read())).convert("RGB")
    if image.width <= image.height:
        raise RuntimeError(f"{key}: image service is still generating; no placeholder accepted")
    image.thumbnail((960, 720))
    image.save(target, "WEBP", quality=82, method=6)
    return key, target.stat().st_size

if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for key, size in executor.map(generate, DISHES.items()):
            print(f"{key}: {size} bytes", flush=True)
