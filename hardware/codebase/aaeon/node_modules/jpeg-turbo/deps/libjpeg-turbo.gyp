{
  'variables': {
    'conditions': [
      [ 'OS == "win"', {
        'object_suffix': 'obj',
      }, {
        'object_suffix': 'o',
      }],
    ],
  },
  'targets': [
    {
      'target_name': 'jpeg-turbo',
      'product_prefix': 'lib',
      'type': 'static_library',
      'cflags': [
        '-w',
      ],
      'msvs_settings': {
        'VCCLCompilerTool': {
          'WarningLevel': '0',
        },
      },
      'xcode_settings': {
        'WARNING_CFLAGS': [
          '-w',
        ],
      },
      'sources': [
        # libjpeg_la_SOURCES from Makefile.am
        'libjpeg-turbo/jcapimin.c',
        'libjpeg-turbo/jcapistd.c',
        'libjpeg-turbo/jccoefct.c',
        'libjpeg-turbo/jccolor.c',
        'libjpeg-turbo/jcdctmgr.c',
        'libjpeg-turbo/jchuff.c',
        'libjpeg-turbo/jcinit.c',
        'libjpeg-turbo/jcmainct.c',
        'libjpeg-turbo/jcmarker.c',
        'libjpeg-turbo/jcmaster.c',
        'libjpeg-turbo/jcomapi.c',
        'libjpeg-turbo/jcparam.c',
        'libjpeg-turbo/jcphuff.c',
        'libjpeg-turbo/jcprepct.c',
        'libjpeg-turbo/jcsample.c',
        'libjpeg-turbo/jctrans.c',
        'libjpeg-turbo/jdapimin.c',
        'libjpeg-turbo/jdapistd.c',
        'libjpeg-turbo/jdatadst.c',
        'libjpeg-turbo/jdatasrc.c',
        'libjpeg-turbo/jdcoefct.c',
        'libjpeg-turbo/jdcolor.c',
        'libjpeg-turbo/jddctmgr.c',
        'libjpeg-turbo/jdhuff.c',
        'libjpeg-turbo/jdinput.c',
        'libjpeg-turbo/jdmainct.c',
        'libjpeg-turbo/jdmarker.c',
        'libjpeg-turbo/jdmaster.c',
        'libjpeg-turbo/jdmerge.c',
        'libjpeg-turbo/jdphuff.c',
        'libjpeg-turbo/jdpostct.c',
        'libjpeg-turbo/jdsample.c',
        'libjpeg-turbo/jdtrans.c',
        'libjpeg-turbo/jerror.c',
        'libjpeg-turbo/jfdctflt.c',
        'libjpeg-turbo/jfdctfst.c',
        'libjpeg-turbo/jfdctint.c',
        'libjpeg-turbo/jidctflt.c',
        'libjpeg-turbo/jidctfst.c',
        'libjpeg-turbo/jidctint.c',
        'libjpeg-turbo/jidctred.c',
        'libjpeg-turbo/jquant1.c',
        'libjpeg-turbo/jquant2.c',
        'libjpeg-turbo/jutils.c',
        'libjpeg-turbo/jmemmgr.c',
        'libjpeg-turbo/jmemnobs.c',

        # if WITH_ARITH_ENC from Makefile.am
        'libjpeg-turbo/jaricom.c',
        'libjpeg-turbo/jcarith.c',
        'libjpeg-turbo/jdarith.c',

        # libturbojpeg_la_SOURCES from Makefile.am
        'libjpeg-turbo/turbojpeg.c',
        'libjpeg-turbo/transupp.c',
        'libjpeg-turbo/jdatadst-tj.c',
        'libjpeg-turbo/jdatasrc-tj.c',
      ],
      'include_dirs': [
        'include',
        'libjpeg-turbo/simd',
        'libjpeg-turbo',
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          'libjpeg-turbo',
        ],
      },
      'defines': [
        'BUILD="0d293537728f211888b04bed6ee19f71e0bda504"',
        'C_ARITH_CODING_SUPPORTED=1',
        'D_ARITH_CODING_SUPPORTED=1',
        'BITS_IN_JSAMPLE=8',
        'HAVE_DLFCN_H=1',
        'HAVE_INTTYPES_H=1',
        'HAVE_LOCALE_H=1',
        'HAVE_MEMCPY=1',
        'HAVE_MEMORY_H=1',
        'HAVE_MEMSET=1',
        'HAVE_STDDEF_H=1',
        'HAVE_STDINT_H=1',
        'HAVE_STDLIB_H=1',
        'HAVE_STRINGS_H=1',
        'HAVE_STRING_H=1',
        'HAVE_SYS_STAT_H=1',
        'HAVE_SYS_TYPES_H=1',
        'HAVE_UNISTD_H=1',
        'HAVE_UNSIGNED_CHAR=1',
        'HAVE_UNSIGNED_SHORT=1',
        'INLINE=inline __attribute__((always_inline))',
        'JPEG_LIB_VERSION=62',
        'LIBJPEG_TURBO_VERSION="1.4.1"',
        'MEM_SRCDST_SUPPORTED=1',
        'NEED_SYS_TYPES_H=1',
        'STDC_HEADERS=1',
        'WITH_SIMD=1',
      ],
      'variables': {
        'yasm_path%': 'yasm',
        'yasm_format%': '-felf',
        'yasm_flags%': [],
      },
      'conditions': [
        [ 'target_arch == "x64"', {
          'defines': [
            'SIZEOF_SIZE_T=8',
          ],
          'cflags': [
            '-msse2',
          ],
          'sources': [
            'libjpeg-turbo/simd/jsimd_x86_64.c',
            'libjpeg-turbo/simd/jfdctflt-sse-64.asm',
            'libjpeg-turbo/simd/jccolor-sse2-64.asm',
            'libjpeg-turbo/simd/jcgray-sse2-64.asm',
            'libjpeg-turbo/simd/jcsample-sse2-64.asm',
            'libjpeg-turbo/simd/jdcolor-sse2-64.asm',
            'libjpeg-turbo/simd/jdmerge-sse2-64.asm',
            'libjpeg-turbo/simd/jdsample-sse2-64.asm',
            'libjpeg-turbo/simd/jfdctfst-sse2-64.asm',
            'libjpeg-turbo/simd/jfdctint-sse2-64.asm',
            'libjpeg-turbo/simd/jidctflt-sse2-64.asm',
            'libjpeg-turbo/simd/jidctfst-sse2-64.asm',
            'libjpeg-turbo/simd/jidctint-sse2-64.asm',
            'libjpeg-turbo/simd/jidctred-sse2-64.asm',
            'libjpeg-turbo/simd/jquantf-sse2-64.asm',
            'libjpeg-turbo/simd/jquanti-sse2-64.asm',
          ],
        }],
        [ 'target_arch == "ia32"', {
          'defines': [
            'SIZEOF_SIZE_T=4',
          ],
          'cflags': [
            '-msse2',
          ],
          'sources': [
            'libjpeg-turbo/simd/jsimd_i386.c',
            'libjpeg-turbo/simd/jsimdcpu.asm',
            'libjpeg-turbo/simd/jfdctflt-3dn.asm',
            'libjpeg-turbo/simd/jidctflt-3dn.asm',
            'libjpeg-turbo/simd/jquant-3dn.asm',
            'libjpeg-turbo/simd/jccolor-mmx.asm',
            'libjpeg-turbo/simd/jcgray-mmx.asm',
            'libjpeg-turbo/simd/jcsample-mmx.asm',
            'libjpeg-turbo/simd/jdcolor-mmx.asm',
            'libjpeg-turbo/simd/jdmerge-mmx.asm',
            'libjpeg-turbo/simd/jdsample-mmx.asm',
            'libjpeg-turbo/simd/jfdctfst-mmx.asm',
            'libjpeg-turbo/simd/jfdctint-mmx.asm',
            'libjpeg-turbo/simd/jidctfst-mmx.asm',
            'libjpeg-turbo/simd/jidctint-mmx.asm',
            'libjpeg-turbo/simd/jidctred-mmx.asm',
            'libjpeg-turbo/simd/jquant-mmx.asm',
            'libjpeg-turbo/simd/jfdctflt-sse.asm',
            'libjpeg-turbo/simd/jidctflt-sse.asm',
            'libjpeg-turbo/simd/jquant-sse.asm',
            'libjpeg-turbo/simd/jccolor-sse2.asm',
            'libjpeg-turbo/simd/jcgray-sse2.asm',
            'libjpeg-turbo/simd/jcsample-sse2.asm',
            'libjpeg-turbo/simd/jdcolor-sse2.asm',
            'libjpeg-turbo/simd/jdmerge-sse2.asm',
            'libjpeg-turbo/simd/jdsample-sse2.asm',
            'libjpeg-turbo/simd/jfdctfst-sse2.asm',
            'libjpeg-turbo/simd/jfdctint-sse2.asm',
            'libjpeg-turbo/simd/jidctflt-sse2.asm',
            'libjpeg-turbo/simd/jidctfst-sse2.asm',
            'libjpeg-turbo/simd/jidctint-sse2.asm',
            'libjpeg-turbo/simd/jidctred-sse2.asm',
            'libjpeg-turbo/simd/jquantf-sse2.asm',
            'libjpeg-turbo/simd/jquanti-sse2.asm',
          ]
        }],
        [ 'target_arch == "arm"', {
          'defines': [
            'SIZEOF_SIZE_T=4',
          ],
          'cflags': [
            '-mfpu=neon',
          ],
          'sources': [
            'libjpeg-turbo/simd/jsimd_arm.c',
            'libjpeg-turbo/simd/jsimd_arm_neon.S',
          ],
        }],
        [ 'target_arch == "arm64"', {
          'defines': [
            'SIZEOF_SIZE_T=8',
          ],
          'sources': [
            'libjpeg-turbo/simd/jsimd_arm64.c',
            'libjpeg-turbo/simd/jsimd_arm64_neon.S',
          ],
        }],
        [ 'OS == "mac"', {
          'variables': {
            'yasm_path': 'yasm',
            'conditions': [
              [ 'target_arch == "ia32"', {
                'yasm_format': '-fmacho',
                'yasm_flags': [
                  '-D__x86__',
                  '-DMACHO',
                  '-Iinclude'
                ],
              }],
              [ 'target_arch == "x64"', {
                'yasm_format': '-fmacho64',
                'yasm_flags': [
                  '-D__x86_64__',
                  '-DMACHO',
                  '-Iinclude',
                ],
              }],
            ],
          },
        }],
        [ 'OS == "linux" or OS=="freebsd" or OS=="openbsd" or OS=="solaris"', {
          'variables': {
            'yasm_path': 'yasm',
            'conditions': [
              [ 'target_arch == "ia32"', {
                'yasm_format': '-felf',
                'yasm_flags': [
                  '-D__x86__',
                  '-DELF',
                  '-Iinclude',
                ],
              }],
              [ 'target_arch == "x64"', {
                'yasm_format': '-felf64',
                'yasm_flags': [
                  '-D__x86_64__',
                  '-DELF',
                  '-Iinclude',
                ],
              }],
            ],
          },
        }],
      ],
      'rules': [
        {
          'rule_name': 'assemble',
          'extension': 'asm',
          'inputs': [],
          'outputs': [
            '<(SHARED_INTERMEDIATE_DIR)/<(RULE_INPUT_ROOT).<(object_suffix)',
          ],
          'action': [
            '<(yasm_path)',
            '<(yasm_format)',
            '<@(yasm_flags)',
            '-o', '<@(_outputs)',
            '<(RULE_INPUT_PATH)',
          ],
          'process_outputs_as_sources': 1,
          'message': 'Building <@(_outputs)'
        },
      ],
    },
  ],
}
