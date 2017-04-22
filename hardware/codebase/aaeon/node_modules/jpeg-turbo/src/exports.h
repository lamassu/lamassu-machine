#ifndef _NODE_JPEG_TURBO_EXPORTS
#define _NODE_JPEG_TURBO_EXPORTS

#include <nan.h>
#include <turbojpeg.h>

// Unfortunately Travis still uses Ubuntu 12.04, and their libjpeg-turbo is
// super old (1.2.0). We still want to build there, but opt in to the new
// flag when possible.
#ifndef TJFLAG_FASTDCT
#define TJFLAG_FASTDCT 0
#endif

static int DEFAULT_QUALITY = 80;
static int DEFAULT_SUBSAMPLING = TJSAMP_420;

enum {
  FORMAT_RGB  = TJPF_RGB,
  FORMAT_BGR  = TJPF_BGR,
  FORMAT_RGBX = TJPF_RGBX,
  FORMAT_BGRX = TJPF_BGRX,
  FORMAT_XRGB = TJPF_XRGB,
  FORMAT_XBGR = TJPF_XBGR,
  FORMAT_GRAY = TJPF_GRAY,
  FORMAT_RGBA = TJPF_RGBA,
  FORMAT_BGRA = TJPF_BGRA,
  FORMAT_ABGR = TJPF_ABGR,
  FORMAT_ARGB = TJPF_ARGB,
};

enum {
  SAMP_444  = TJSAMP_444,
  SAMP_422  = TJSAMP_422,
  SAMP_420  = TJSAMP_420,
  SAMP_GRAY = TJSAMP_GRAY,
  SAMP_440  = TJSAMP_440,
};

NAN_METHOD(BufferSize);
NAN_METHOD(CompressSync);
NAN_METHOD(DecompressSync);

#endif
