#include "exports.h"

NAN_METHOD(BufferSize) {
  if (info.Length() < 1) {
    return Nan::ThrowError(Nan::TypeError("Too few arguments"));
  }

  // Options
  v8::Local<v8::Object> options = info[0].As<v8::Object>();
  if (!options->IsObject()) {
    return Nan::ThrowError(Nan::TypeError("Options must be an Object"));
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

  // Finally, calculate the buffer size
  uint32_t dstLength = tjBufSize(width, height, jpegSubsamp);

  info.GetReturnValue().Set(Nan::New(dstLength));
}
