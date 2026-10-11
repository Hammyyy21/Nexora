"""Rebuild only the bundled demo; never consumes editor/user source."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/firmware/cooling.c'
FLAGS = ['--target=arm-none-eabi', '-mcpu=cortex-m3', '-mthumb', '-O2', '-ffreestanding', '-fno-builtin']
CLANG = os.environ.get('CLANG', 'clang')
OBJDUMP = os.environ.get('LLVM_OBJDUMP') or shutil.which('llvm-objdump')
if not OBJDUMP:
    OBJDUMP = subprocess.check_output(['xcrun', '--find', 'llvm-objdump'], text=True).strip()

def text_section(path):
    data = path.read_bytes()
    assert data[:6] == b'\x7fELF\x01\x01', 'Expected little-endian ELF32'
    assert struct.unpack_from('<H', data, 18)[0] == 40, 'Expected ARM'
    offset = struct.unpack_from('<I', data, 32)[0]
    size, count, strings_index = struct.unpack_from('<HHH', data, 46)
    sections = [struct.unpack_from('<10I', data, offset + i * size) for i in range(count)]
    strings = sections[strings_index]
    names = data[strings[4]:strings[4] + strings[5]]
    for index, section in enumerate(sections):
        name = names[section[0]:].split(b'\0')[0]
        if name == b'.text':
            assert not any(s[1] in (4, 9) and s[7] == index and s[5] for s in sections), 'Unresolved text relocations'
            return list(data[section[4]:section[4] + section[5]])
    raise ValueError('Missing .text')

with tempfile.TemporaryDirectory() as tmp:
    obj = Path(tmp) / 'cooling.o'
    rebuilt = Path(tmp) / 'assembled.o'
    assembly = ROOT / 'assets/firmware/cooling.s'
    subprocess.run([CLANG, *FLAGS, '-c', str(SOURCE), '-o', str(obj)], check=True)
    subprocess.run([CLANG, *FLAGS, '-S', str(SOURCE), '-o', str(assembly)], check=True)
    subprocess.run([CLANG, *FLAGS[:3], '-c', str(assembly), '-o', str(rebuilt)], check=True)
    code = text_section(obj)
    assert code == text_section(rebuilt), 'Assembly and C object differ'
    disassembly = subprocess.check_output([OBJDUMP, '-d', str(obj)], text=True)
    disassembly = disassembly[disassembly.index('Disassembly of section .text:'):]
    source = SOURCE.read_text()
    revision = 2166136261
    for b in source.encode():
        revision = ((revision ^ b) * 16777619) & 0xffffffff
    result = {
        'id': 'cooling-cortex-m3-demo-v1',
        'targetArchitecture': 'ARM Cortex-M3 · Thumb-2 · little endian',
        'compiler': subprocess.check_output([CLANG, '--version'], text=True).splitlines()[0],
        'compilerFlags': FLAGS,
        'sourceRevision': f'fnv1a-{revision:08x}',
        'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
        'status': 'demo',
        'assembly': assembly.read_text(),
        'disassembly': disassembly,
        'machineCode': code,
        'machineSha256': hashlib.sha256(bytes(code)).hexdigest(),
        'addressKind': 'section-offset',
        'section': '.text',
    }
    (ROOT / 'src/firmware/demoBuild.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'Verified {len(code)} .text bytes: compiled C equals reassembled compiler output.')
