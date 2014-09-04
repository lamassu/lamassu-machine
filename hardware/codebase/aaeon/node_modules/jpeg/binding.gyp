{
    "targets": [
        {
            "target_name": "jpeg",
            "sources": [
                "src/common.cpp",
                "src/jpeg_encoder.cpp",
                "src/jpeg.cpp",
                "src/fixed_jpeg_stack.cpp",
                "src/dynamic_jpeg_stack.cpp",
                "src/module.cpp",
            ],
            "conditions" : [
                [
                    'OS=="linux"', {
                        "libraries" : [
                            '-ljpeg'
                        ],
                        'cflags!': [ '-fno-exceptions' ],
                        'cflags_cc!': [ '-fno-exceptions' ]
                    }
                ],
                [
                    'OS=="mac"', {
                        'xcode_settings': {
                            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'
                        },
                        "libraries" : [
                            '-ljpeg'
                        ]
                    }
                ],
                [
                    'OS=="win"', {
                        "include_dirs" : [ "gyp/include" ],
                        "libraries" : [
                            '<(module_root_dir)/gyp/lib/libjpeg.lib'
                        ]
                    }
                ]
            ]
        }
    ]
}
