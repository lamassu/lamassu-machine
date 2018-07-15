{
    "targets": [
        {
            "target_name": "camera-wrapper",
            "sources": [
                "lib/camera/src/native/camera.cpp",
                "lib/camera/src/native/types.cpp",
                "lib/camera/src/native/thread.cpp",
                "lib/camera/src/native/supyo.cpp",
                "lib/camera/src/native/pico/picort.cpp",
            ],
            "link_settings": {
                "libraries": [
                     "-lopencv_core",
                     "-lopencv_highgui",
                     "-lopencv_imgproc",
                     "-lopencv_video",
                 ]
            },
            "cflags": [
                "-g", "-std=c++11", "-Wall"
            ],
            "conditions": [
                ['OS=="linux"', {
                    'include_dirs': [
                        '/usr/include'
                        ],
                    'link_settings': {
                        'library_dirs': ['/usr/share/lib']
                    },
                    'cflags!': ['-fno-exceptions'],
                    'cflags_cc!': ['-fno-rtti', '-fno-exceptions']
                }],
                ['OS=="mac"', {
                    'include_dirs': [
                        '/opt/local/include'
                        ],
                    'link_settings': {
                        'library_dirs': ['/opt/local/lib']
                    },
                    'xcode_settings': {
                        'MACOSX_DEPLOYMENT_TARGET' : '10.7',
                        'OTHER_CFLAGS': [
                            "-mmacosx-version-min=10.7",
                            "-std=c++11",
                            "-stdlib=libc++"
                        ],
                        'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
                        'GCC_ENABLE_CPP_RTTI': 'YES'
                    }
                }]
            ]
    }
    ]
}
