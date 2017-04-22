#include "exports.h"

void compressBufferFreeCallback(char *data, void *hint) {
  tjFree((unsigned char*) data);
}

NAN_METHOD(CompressSync) {
  int err;
  const char* tjErr;

  if (info.Length() < 2) {
    return Nan::ThrowError(Nan::TypeError("Too few arguments"));
  }

  int cursor = 0;

  // Input buffer
  v8::Local<v8::Object> srcObject = info[cursor++].As<v8::Object>();
  if (!node::Buffer::HasInstance(srcObject)) {
    return Nan::ThrowError(Nan::TypeError("Invalid source buffer"));
  }

  unsigned char* srcData = (unsigned char*) node::Buffer::Data(srcObject);

  // Output buffer
  v8::Local<v8::Object> dstObject;
  bool havePreallocatedBuffer = false;

  // Options
  v8::Local<v8::Object> options = info[cursor++].As<v8::Object>();

  if (node::Buffer::HasInstance(options) && info.Length() > cursor) {
    dstObject = options;
    options = info[cursor++].As<v8::Object>();
    havePreallocatedBuffer = true;
  }

  if (!options->IsObject()) {
    return Nan::ThrowError(Nan::TypeError("Options must be an Object"));
  }

  // Format of input buffer
  v8::Local<v8::Value> formatObject =
    options->Get(Nan::New("format").ToLocalChecked());

  if (formatObject->IsUndefined()) {
    return Nan::ThrowError(Nan::TypeError("Missing format"));
  }

  uint32_t format = formatObject->Uint32Value();

  // Figure out bpp from format (needed later for stride)
  uint32_t bpp;
  switch (format) {
  case FORMAT_GRAY:
    bpp = 1;
    break;
  case FORMAT_RGB:
  case FORMAT_BGR:
    bpp = 3;
    break;
  case FORMAT_RGBX:
  case FORMAT_BGRX:
  case FORMAT_XRGB:
  case FORMAT_XBGR:
  case FORMAT_RGBA:
  case FORMAT_BGRA:
  case FORMAT_ABGR:
  case FORMAT_ARGB:
    bpp = 4;
    break;
  default:
    return Nan::ThrowError(Nan::TypeError("Invalid output format"));
  }

  // Subsampling
  v8::Local<v8::Value> sampObject =
    options->Get(Nan::New("subsampling").ToLocalChecked());

  uint32_t jpegSubsamp = sampObject->IsUndefined()
    ? DEFAULT_SUBSAMPLING
    : sampObject->Uint32Value();

  switch (jpegSubsamp) {
  case SAMP_444:
  case SAMP_422:
  case SAMP_420:
  case SAMP_GRAY:
  case SAMP_440:
    break;
  default:
    return Nan::ThrowError(Nan::TypeError("Invalid subsampling method"));
  }

  // Width
  v8::Local<v8::Value> widthObject =
    options->Get(Nan::New("width").ToLocalChecked());

  if (widthObject->IsUndefined()) {
    return Nan::ThrowError(Nan::TypeError("Missing width"));
  }

  uint32_t width = widthObject->Uint32Value();

  // Height
  v8::Local<v8::Value> heightObject =
    options->Get(Nan::New("height").ToLocalChecked());

  if (heightObject->IsUndefined()) {
    return Nan::ThrowError(Nan::TypeError("Missing height"));
  }

  uint32_t height = heightObject->Uint32Value();

  // Stride
  v8::Local<v8::Value> strideObject =
    options->Get(Nan::New("stride").ToLocalChecked());

  uint32_t stride = strideObject->IsUndefined()
    ? width
    : strideObject->Uint32Value();

  // Quality
  v8::Local<v8::Value> qualityObject =
    options->Get(Nan::New("quality").ToLocalChecked());

  int quality = qualityObject->IsUndefined()
    ? DEFAULT_QUALITY
    : qualityObject->Uint32Value();

  // Set up buffers if required
  int flags = TJFLAG_FASTDCT;
  unsigned char* dstData = NULL;
  uint32_t dstLength = tjBufSize(width, height, jpegSubsamp);

  if (havePreallocatedBuffer) {
    if (node::Buffer::Length(dstObject) < dstLength) {
      return Nan::ThrowError("Potentially insufficient output buffer");
    }

    dstData = (unsigned char*) node::Buffer::Data(dstObject);
    flags |= TJFLAG_NOREALLOC;
  }

  tjhandle handle = tjInitCompress();
  if (handle == NULL) {
    return Nan::ThrowError(tjGetErrorStr());
  }

  unsigned long jpegSize;
  err = tjCompress2(
    handle,
    srcData,
    width,
    stride * bpp,
    height,
    format,
    &dstData,
    &jpegSize,
    jpegSubsamp,
    quality,
    flags
  );

  if (err != 0) {
    tjErr = tjGetErrorStr();
    tjDestroy(handle);
    return Nan::ThrowError(tjErr);
  }

  if (!havePreallocatedBuffer) {
    dstObject = Nan::NewBuffer((char*) dstData, jpegSize,
      compressBufferFreeCallback, NULL).ToLocalChecked();
  }

  err = tjDestroy(handle);
  if (err != 0) {
    return Nan::ThrowError(tjGetErrorStr());
  }

  // Unsure how to return a slice from here. Let's leave it to JS instead.
  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  obj->Set(Nan::New("data").ToLocalChecked(), dstObject);
  obj->Set(Nan::New("size").ToLocalChecked(), Nan::New((uint32_t) jpegSize));

  info.GetReturnValue().Set(obj);
}
