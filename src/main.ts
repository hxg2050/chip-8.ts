import { Chip8 } from "./Chip8";

const app = document.querySelector<HTMLDivElement>('#app')!;
const fileinput = document.createElement('input');
fileinput.type = 'file';
app.append(fileinput);

const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 320;
canvas.style.backgroundColor = '#212125';
app.append(canvas);
canvas.style.display = 'block';

fileinput.onchange = (evt) => {
  const chip8 = new Chip8();
  chip8.setView(canvas);
  const reader = new FileReader();
  reader.onload = (e) => {
    chip8.loadRom(new Uint8Array(new Uint8Array(reader.result as ArrayBuffer)));
  }
  reader.readAsArrayBuffer(fileinput!.files![0]);

  document.addEventListener('keydown', (e) => {
    chip8.setInput(e.key, 1);
  })
  document.addEventListener('keyup', (e) => {
    chip8.setInput(e.key, 0);
  })
}
