# Inject the Windows / macOS system trust store into Python's ssl module so
# that httpx and LiteLLM honor corporate / OS-managed CAs. Must run before
# any module loads that triggers an HTTPS connection at import time.
try:
    import truststore as _truststore

    _truststore.inject_into_ssl()
except Exception:  # pragma: no cover
    pass
