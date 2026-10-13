"""PyTorch saglik denetimi (kur.bat ve kur-gpu.bat kullanir). Cikis kodu: 0 = torch+torchaudio tutarli ve (varsa) CUDA calisiyor,
3 = torch kurulu degil, 4 = import edilemiyor ya da torch/torchaudio surumleri uyumsuz (DLL hatasi), 5 = CUDA kullanilamiyor (CPU surumu ya da surucu).
Windows'ta DLL hatalari acilir pencere yerine ImportError olsun diye SetErrorMode cagrilir."""
import importlib.util
import sys

if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.kernel32.SetErrorMode(0x8003)
    except Exception:
        pass

if importlib.util.find_spec("torch") is None:
    print("torch kurulu degil")
    sys.exit(3)
try:
    import torch
    import torchaudio
except BaseException as e:  # noqa: BLE001 - DLL hatalari OSError/ImportError olarak gelir
    print("HATA: torch/torchaudio yuklenemedi:", str(e).strip().splitlines()[0][:200] if str(e).strip() else type(e).__name__)
    sys.exit(4)
tv, av = torch.__version__, torchaudio.__version__
print(f"torch {tv} | torchaudio {av} | CUDA derlemesi: {torch.version.cuda}")
if tv.split("+")[0] != av.split("+")[0] or tv.split("+")[-1:] != av.split("+")[-1:]:
    print("HATA: torch ve torchaudio surumleri birbirine uymuyor")
    sys.exit(4)
try:
    ok = torch.cuda.is_available()
    if ok:
        torch.zeros(1).cuda()  # sm_120 (RTX 50xx) uyumsuzlugu burada patlar
        print("CUDA: calisiyor |", torch.cuda.get_device_name(0))
except BaseException as e:  # noqa: BLE001
    print("HATA: CUDA denemesi basarisiz:", str(e).strip().splitlines()[0][:200])
    sys.exit(5)
if not ok:
    print("CUDA gorunmuyor (CPU surumu ya da surucu)")
    sys.exit(5)
sys.exit(0)
