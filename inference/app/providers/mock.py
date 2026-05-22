import io

from PIL import Image

from .base import Provider, TryonInput, TryonOutput


class MockProvider(Provider):
    """
    Test provider. Returns a side-by-side composite of person + garment so the
    end-to-end wiring (upload -> queue -> worker -> result) is visibly working
    without any GPU work.
    """

    def run(self, inp: TryonInput) -> TryonOutput:
        person = Image.open(io.BytesIO(inp.person_bytes)).convert("RGB")
        garment = Image.open(io.BytesIO(inp.garment_bytes)).convert("RGB")

        # Resize both to the same height for a clean side-by-side.
        h = 512
        person = _resize_h(person, h)
        garment = _resize_h(garment, h)

        canvas = Image.new("RGB", (person.width + garment.width, h), (255, 255, 255))
        canvas.paste(person, (0, 0))
        canvas.paste(garment, (person.width, 0))

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return TryonOutput(
            result_bytes=buf.getvalue(),
            content_type="image/png",
            model_used="mock",
            cost_usd=0.0,
        )


def _resize_h(img: Image.Image, h: int) -> Image.Image:
    w = max(1, round(img.width * h / img.height))
    return img.resize((w, h), Image.LANCZOS)
