#ifndef DYNAMIC_JPEG_H
#define DYNAMIC_JPEG_H

#include <node.h>
#include <node_buffer.h>

#include <vector>
#include <utility>

#include "common.h"
#include "jpeg_encoder.h"

class DynamicJpegStack : public node::ObjectWrap {
    int quality;
    buffer_type buf_type;

    unsigned char *data;

    int bg_width, bg_height; // background width and height after setBackground
    Rect dyn_rect; // rect of dynamic push area (updated after each push)

    void update_optimal_dimension(int x, int y, int w, int h);

    static void UV_JpegEncode(uv_work_t *req);
    static void UV_JpegEncodeAfter(uv_work_t *req);
public:
    DynamicJpegStack(buffer_type bbuf_type);
    ~DynamicJpegStack();

    v8::Handle<v8::Value> JpegEncodeSync();
    void Push(unsigned char *data_buf, int x, int y, int w, int h);
    void SetBackground(unsigned char *data_buf, int w, int h);
    void SetQuality(int q);
    v8::Handle<v8::Value> Dimensions();
    void Reset();

    static void Initialize(v8::Handle<v8::Object> target);
    static v8::Handle<v8::Value> New(const v8::Arguments &args);
    static v8::Handle<v8::Value> JpegEncodeSync(const v8::Arguments &args);
    static v8::Handle<v8::Value> JpegEncodeAsync(const v8::Arguments &args);
    static v8::Handle<v8::Value> Push(const v8::Arguments &args);
    static v8::Handle<v8::Value> SetBackground(const v8::Arguments &args);
    static v8::Handle<v8::Value> SetQuality(const v8::Arguments &args);
    static v8::Handle<v8::Value> Dimensions(const v8::Arguments &args);
    static v8::Handle<v8::Value> Reset(const v8::Arguments &args);
};

#endif

