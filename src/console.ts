import { readFile } from "fs/promises";
import { Chip8 } from "./Chip8.js";
import readline from 'readline';

class ConsoleChip8 extends Chip8 {
    render(): void {
        console.clear();
        const width = 64;
        const height = 32;

        for (let y = 0; y < height; y++) {

            for (let x = 0; x < width; x++) {
                const index = y * width + x;

                if (this.gfx[index] === 1) {
                    process.stdin.write("██");
                } else {
                    process.stdin.write("  ");
                }
            }
            process.stdin.write("\n");
        }
    }
}

// cmd ... romPath
const [, , romPath] = process.argv;


readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const chip8 = new ConsoleChip8();

readFile(romPath).then(file => {
    chip8.loadRom(new Uint8Array(file));
});

process.stdin.on('keypress', (c, k) => {
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    chip8.setInput(c, 1);
    setTimeout(() => {
        chip8.setInput(c, 0);
    }, 100);
});