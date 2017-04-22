#include "exports.h"

NAN_METHOD(DecompressSync) {
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
  uint32_t srcLength = node::Buffer::Length(srcObject);

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

  // Format of output buffer
  v8::Local<v8::Value> formatObject =
    options->Get(Nan::New("format").ToLocalChecked());

  if (formatObject->IsUndefined()) {
    return Nan::ThrowError(Nan::TypeError("Missing format"));
  }

  uint32_t format = formatObject->Uint32Value();

  // Figure out bpp from format (needed to calculate output buffer size)
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

  // Output buffer option (deprecated)
  v8::Local<v8::Object> outObject;

  if (!havePreallocatedBuffer) {
    v8::Local<v8::Object> outObject =
      options->Get(Nan::New("out").ToLocalChecked()).As<v8::Object>();

    if (!outObject->IsUndefined() && node::Buffer::HasInstance(outObject)) {
      dstObject = outObject;
      havePreallocatedBuffer = true;
    }
  }

  tjhandle handle = tjInitDecompress();
  if (handle == NULL) {
    return Nan::ThrowError(tjGetErrorStr());
  }

  int width, height, jpegSubsamp;

  err = tjDecompressHeader2(
    handle, srcData, srcLength, &width, &height, &jpegSubsamp);

  if (err != 0) {
    tjErr = tjGetErrorStr();
    tjDestroy(handle);
    return Nan::ThrowError(tjErr);
  }

  uint32_t dstLength = width * height * bpp;

  if (havePreallocatedBuffer) {
    if (node::Buffer::Length(dstObject) < dstLength) {
      return Nan::ThrowError("Insufficient output buffer");
    }
  }
  else {
    dstObject = Nan::NewBuffer(dstLength).ToLocalChecked();
  }

  unsigned char* dstData = (unsigned char*) node::Buffer::Data(dstObject);

  err = tjDecompress2(
    handle, srcData, srcLength, dstData, width, 0, height, format, TJFLAG_FASTDCT);

  if (err != 0) {
    tjErr = tjGetErrorStr();
    tjDestroy(handle);
    return Nan::ThrowError(tjErr);
  }

  err = tjDestroy(handle);
  if (err != 0) {
    return Nan::ThrowError(tjGetErrorStr());
  }

  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  obj->Set(Nan::New("data").ToLocalChecked(), dstObject);
  obj->Set(Nan::New("width").ToLocalChecked(), Nan::New(width));
  obj->Set(Nan::New("height").ToLocalChecked(), Nan::New(height));
  obj->Set(Nan::New("subsampling").ToLocalChecked(), Nan::New(jpegSubsamp));
  obj->Set(Nan::New("size").ToLocalChecked(), Nan::New(dstLength));
  obj->Set(Nan::New("bpp").ToLocalChecked(), Nan::New(bpp));

  info.GetReturnValue().Set(obj);
}
