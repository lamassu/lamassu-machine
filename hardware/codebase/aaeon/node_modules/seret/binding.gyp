{
  "targets": [{
    "target_name": "seret",
    "sources": ["./src/camera.c", "./src/seret.cc"],
    "cflags": ["-Wall", "-Wextra", "-pedantic", "-ftrapv"],
    "cflags_c": ["-std=c11", "-Wno-unused-parameter"],
    "cflags_cc": ["-std=c++11"],
    "libraries": ["-lturbojpeg"]
  }]
}

