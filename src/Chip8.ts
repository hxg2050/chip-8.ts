export class Chip8 {
    // (rom只读内存)游戏程序代码加载位置
    pc = 0x200;
    // (Operation Code)指令
    // opcode = 0;
    // (index)索引寄存器
    i = 0;
    // 寄存器
    V = new Uint8Array(16);
    // 栈(stack)顶指针(pointer)
    sp = 0;
    // 栈
    stack = new Array(16);

    // 1k = 2**10
    /**
     * chip8 总共有4k内存
     * Memory Map:
     * +---------------+= 0xFFF (4095) End of Chip-8 RAM
     * |               |
     * |               |
     * |               |
     * |               |
     * |               |
     * | 0x200 to 0xFFF|
     * |     Chip-8    |
     * | Program / Data|
     * |     Space     |
     * |               |
     * |               |
     * |               |
     * +- - - - - - - -+= 0x600 (1536) Start of ETI 660 Chip-8 programs
     * |               |
     * |               |
     * |               |
     * +---------------+= 0x200 (512) Start of most Chip-8 programs
     * | 0x000 to 0x1FF|
     * | Reserved for  |
     * |  interpreter  |
     * +---------------+= 0x000 (0) Start of Chip-8 RAM
     * 
     * 0x0 ~ 0x1ff: 内部保留
     * 0x200 ~ 0xe9f: 程序可以自由使用
     * 0xea0 ~ 0xeff: 保留给栈以及其他内部应用
     * 0xf00 ~ 0xfff: 保留给屏幕显示使用
     */
    memory = new Uint8Array(1024 * 4).fill(0);

    /**
     * 输出相当于显存，只有2048bit，2k显存？
     */
    gfx = new Uint8Array(64 * 32).fill(0);

    // 输入
    /**
     * 原版                  映射
     * 1 2 3 B              1 2 3 4
     * 4 5 6 D      ->      Q W E R 
     * 7 8 9 E              A S D F
     * A 0 B F              Z X C V
     * 每个bit记录一个输入，1为输入，0为没有输入
     */
    key: number[] = new Array(16).fill(0);

    keyMap: Record<string, number> = {
        "1": 0x1, "2": 0x2, "3": 0x3, "4": 0xC,
        "Q": 0x4, "W": 0x5, "E": 0x6, "R": 0xD,
        "A": 0x7, "S": 0x8, "D": 0x9, "F": 0xE,
        "Z": 0xA, "X": 0x0, "C": 0xB, "V": 0xF,
    }

    // 计时器
    /**
     * 当计时器值大于0时，需要按照60hz执行递减直到0
     * 一个完整周期就是每秒60次循环即模拟cpu的60hz频率
     */
    delayTimer = 0;
    soundTimer = 0;

    /**
     * NNN：表示地址，比如：0NNN表示从NNN处内存地址开始执行子程序
     * NN：8位常量，比如：4XNN表示将寄存器VX中的值与常量NN进行比对
     * N：4位常量，用法与NN类似
     * X和Y：表示两个4位的寄存器标识，比如V0表示寄存器0，VF表示寄存器15（0xF）
     * PC：程序计数器（Program Counter）
     * I：16位的索引寄存器
     */
    opCodeExec() {
        // 获取操作,指令
        const opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];

        // console.log(opcode.toString(16));
        const instruction = opcode & 0xf000;
        const X = (opcode >> 8) & 0x00f;
        const Y = (opcode >> 4) & 0x00f;
        const N = opcode & 0x000f;
        const NN = opcode & 0x00ff;
        const NNN = opcode & 0x0fff;

        // 0xe0 清除屏幕
        // 0xee 从子程序返回
        switch (instruction) {
            case 0x0000:
                switch (NN) {
                    // 00E0 - CLS
                    // 清除画面 实作方法:请依据绘图引擎不同自行设计
                    case 0x00e0:
                        // this.gfx.fill(0);

                        for (var i = 0; i < this.gfx.length; i++) {
                            this.gfx[i] = 0;
                        }
                        this.pc += 2;
                        break;
                    // 00EE- RET
                    // Return from a subroutine 实作方法:将Stack最上层的address放到ProgramCounter里，并将StackPointer减少一层
                    case 0x00ee:
                        this.sp--;
                        this.pc = this.stack[this.sp];
                        break;
                    default:
                    // this.pc += 2;
                }
                break;
            // 1NNN- JP addr
            // 跳到NNN这个address执行 实作方法: ProgramCounter <= NNN
            case 0x1000:
                this.pc = NNN;
                break;
            // 2NNN- CALL addr
            // 呼叫NNN位址中的子程序 实作方法:将StackPointer增加1，并把目前的ProgramCounter放到Stack中，最后把ProgramCounter更改为NNN
            case 0x2000:
                this.stack[this.sp] = this.pc + 2;
                this.sp++;
                this.pc = NNN;
                break;
            // 3XNN- SE Vx, byte
            // if Vx = kk, 跳过下一个指令 实作方法:比较Vx占存器所储存的值是否与常数NN相同，如果结果为真，就跳过一次Opcode
            case 0x3000:
                // 判断是否跳过下一个指令
                this.pc += this.V[X] === NN ? 4 : 2;
                break;
            // 4XNN- SNE Vx, byte
            // if Vx != kk, 跳过下一个指令 实作方法:比较Vx占存器所储存的值是否与常数NN相异，如果结果为真，就跳过一次Opcode
            case 0x4000:
                // 和上一条相反
                this.pc += this.V[X] !== NN ? 4 : 2;
                break;
            // 5XY0- SE Vx, Vy
            // if Vx = Vy, 跳过下一个指令 实作方法:比较Vx占存器所储存的值是否与Vy占存器所储存的值相同，如果结果为真，就跳过一次Opcode
            case 0x5000:
                this.pc += this.V[X] === this.V[Y] ? 4 : 2;
                break;
            // 6XNN- LD Vx, byte
            // 将Vx的值设为NN 实作方法: Vx <= NN
            case 0x6000:
                this.V[X] = NN;
                this.pc += 2;
                break;
            // 7XNN- ADD Vx, byte
            // Vx的值加上NN之后，再放到Vx中 实作方法: Vx = Vx + NN
            case 0x7000:
                this.V[X] += NN;
                this.pc += 2;
                break;
            case 0x8000:
                switch (N) {
                    // 8XY0- LD Vx, Vy
                    // Vy的值放到Vx 实作方法: Vx = Vy
                    case 0x0000:
                        this.V[X] = this.V[Y];
                        break;
                    // 8XY1- OR Vx, Vy
                    // Vx与Vy的每个bit做OR位元运算 实作方法: Vx = Vx | Vy
                    case 0x0001:
                        this.V[X] |= this.V[Y];
                        break;
                    // 8XY2- AND Vx, Vy
                    // Vx与Vy的每个bit做AND位元运算 实作方法: Vx = Vx & Vy
                    case 0x0002:
                        this.V[X] &= this.V[Y];
                        break;
                    // 8XY3- XOR Vx, Vy
                    // Vx与Vy的每个bit做XOR位元运算 实作方法: Vx = Vx ^ Vy
                    case 0x0003:
                        this.V[X] ^= this.V[Y];
                        break;
                    // 8XY4- ADD Vx, Vy
                    // 将Vx的值设为Vx+Vy，若相加数值超过255则将VF(CarryFlag)设为1 实作方法: Vx = Vx + Vy, 若相加结果无法完整放于8bits中，则将VF设为1，并把低位元的8bits放到Vx中
                    case 0x0004:
                        this.V[0xf] = (this.V[X] + this.V[Y]) > 0xff ? 1 : 0;
                        this.V[X] += this.V[Y];
                        break;
                    // 8XY5- SUB Vx, Vy
                    // 将Vx的值设为Vx-Vy，若Vx>Vy则将VF设为1，否则为0 实作方法: Vx = Vx - Vy, 若Vx>Vy则将VF的值设为1，否则为0 ，并将相减结果存放至Vx中
                    case 0x0005:
                        this.V[0xf] = this.V[X] > this.V[Y] ? 1 : 0;
                        this.V[X] -= this.V[Y];
                        break;
                    // 8XY6 - SHR Vx {, Vy}
                    // 将Vx最大位元的数值放到VF中，并将Vx除以2 实作方法:将Vx最大位元放置VF中后，把Vx向右位移1bit
                    case 0x0006:
                        this.V[0xf] = this.V[X] & 0x1;
                        this.V[X] >>= 1;
                        break;
                    // 8XY7- SUBN Vx, Vy
                    // 将Vx的值设为Vy-Vx，若Vy>Vx则将VF设为1，否则为0 实作方法: Vx = Vy - Vx, 若Vy>Vx则将VF的值设为1，否则为0 ，并将相减结果存放至Vx中
                    case 0x0007:
                        this.V[0xf] = this.V[Y] > this.V[X] ? 1 : 0;
                        this.V[X] = this.V[Y] - this.V[X];
                        break;
                    // 8XYE- SHL Vx {, Vy}
                    // 将Vx最大位元的数值放到VF中，并将Vx乘以2 实作方法:将Vx最大位元放置VF中后，把Vx向右位移1bit
                    case 0x000e:
                        this.V[0xf] = (this.V[X] >> 7) & 0x01;
                        this.V[X] <<= 1;
                        break;
                }
                this.pc += 2;
                break;
            case 0x9000:
                switch (N) {
                    // 9xy0- SNE Vx, Vy
                    // if Vx != Vy 跳过下一个指令 实作方法:若Vx != Vy，则跳过一次Opcode
                    case 0x0000:
                        this.pc += this.V[X] !== this.V[Y] ? 4 : 2;
                        break;
                }
                break;
            // ANNN- LD I, addr
            // 将I的值设为NNN 实作方法:恩…如上所述
            case 0xa000:
                this.i = NNN;
                this.pc += 2;
                break;
            // BNNN- JP V0, addr
            // 程式跳至NNN+V0的位置执行 实作方法:将ProgramCounter的值设为NNN再加上暂存器V0的值
            case 0xb000:
                this.pc = this.V[0] + NNN;
                break;
            // CXNN- RND Vx, byte
            // 随机产生一个8bits的数字与常数NN做AND运算，并值放置Vx中 实作方法:呼叫C语言中的乱数产生器产生0~255的数字，并透过8XY2的概念来执行AND运算，运算结果放到Vx的值中
            case 0xc000:
                this.V[X] = Math.floor(Math.random() * 256) & NN;
                this.pc += 2;
                break;
            // DXYN- DRW Vx, Vy, nibble
            // 在(Vx, Vy)的座标上绘制一个从I所储存的位址开始n bytes的sprite，若画面有任何已存在的pixel被修改，则将VF设为1(CollisionFlag)实作方法: 从I所储存的位址开始以byte为单位绘制画面，每个pixel绘制之前都须与现有画面上的pixel做XOR运算(参阅8XY3 opcode)，若结果为真，则将VF值改为1否则为0 。详细绘制方法请参阅绘图引擎的相关文件。
            case 0xd000:
                this.draw(this.V[X], this.V[Y], N);
                this.pc += 2;
                break;
            case 0xe000:
                switch (NN) {
                    // Ex9E- SKP Vx
                    // 若存放在Vx的KeyCode等于目前所按下的按键，则跳过下个Opcode 实作方法:检查目前按下的KeyCode是否等于Vx的值，若两值相等则将ProgramCounter加2
                    case 0x009e:
                        this.pc += this.key[this.V[X]] === 1 ? 4 : 2;
                        break;
                    // EXA1- SKNP Vx
                    // 若存放在Vx的KeyCode目前没有被按下，则跳过下个Opcode 实作方法:检查Vx目前的KeyCode是否处于非按下的情况，若为非按下的情况则将ProgramCounter加2
                    case 0x00a1:
                        this.pc += this.key[this.V[X]] !== 1 ? 4 : 2;
                        break;
                }
                break;
            case 0xf000:
                switch (NN) {
                    // FX07- LD Vx, DT
                    // Vx的值设为目前的Delay Time
                    case 0x0007:
                        this.V[X] = this.delayTimer;
                        this.pc += 2;
                        break;
                    // Fx0A- LD Vx, K
                    // 等待按键输入，当任一按键触发时将其KeyCode存放至Vx中 实作方法:这是一个blocking的Opcode，会等待任一按键触发之后将其值存放至Vx当中
                    case 0x000a:
                        // todo 等待输入
                        const input = this.getInput();
                        if (input !== -1) {
                            this.V[X] = input;
                            this.pc += 2;
                        }
                        // this.V[X] = this.getInput();
                        break;
                    // FX15- LD DT, Vx
                    // 将目前Delay Timer的值设为Vx所存放的值
                    case 0x0015:
                        this.delayTimer = this.V[X];
                        this.pc += 2;
                        break;
                    // FX18- LD ST, Vx
                    // 将目前Sound Timer的值设为Vx所存放的值
                    case 0x0018:
                        this.soundTimer = this.V[X];
                        this.pc += 2;
                        break;
                    // FX1E- ADD I, Vx
                    // 将I与Vx的值相加之后存放至I当中
                    case 0x001e:
                        this.i += this.V[X];
                        this.pc += 2;
                        break;
                    // FX29- LD F, Vx
                    // 将Vx的值对应到正确字型记忆体位置后存放到I 实作方法:第一次看到这个有点不解，举个范例来解释比较清楚，由于我们存放预设字型的位置是0x0000~ 0x0050，每个字各占5 bytes大小，假设Vx暂存器的值是3，那么它所对应的字型3记忆体位置应为0x000F开始，所以将0x000F放至I当中。简单来说因为每个字占5bytes而且又是从0开始，所以将Vx当中的值乘上5后即可存放至I。
                    case 0x0029:
                        this.i = 5 * this.V[X];
                        this.pc += 2;
                        break;
                    // FX33- LD B, Vx
                    // 将Vx中的值转换成BCD表示法，并将结果分别存放至记忆体位址I(百位数字),I+1(十位数字),I+2(个位数)实作方法 : BCD转换不多谈，来说明一下I存放的方法，由于I存放的是记忆体位址，所以必须藉由memory[I]这样的存取方式存放值到记忆体当中。
                    case 0x0033:
                        this.memory[this.i] = (this.V[X] % 1000) / 100;
                        this.memory[this.i + 1] = (this.V[X] % 100) / 10;
                        this.memory[this.i + 2] = (this.V[X] % 10) / 1;
                        this.pc += 2;
                        break;
                    // FX55- LD [I], Vx
                    // 俗称的register dump，把特定范围register所存放的值复制一份到从I开始的连续记忆体当中 实作方法: V0~Vx依序将值复制到I, I+1, I+2….V +x当中
                    case 0x0055:
                        for (let i = 0; i <= X; i++) {
                            this.memory[this.i + i] = this.V[i];
                        }
                        this.i += X + 1;
                        this.pc += 2;
                        break;
                    // FX65- LD Vx, [I]
                    // 从I开始的memory当中依序取出值存放到register当中 实作方法: I, I+1, I+2….V+x依序将值复制到V0~Vx当中
                    case 0x0065:
                        for (let i = 0; i <= X; i++) {
                            this.V[i] = this.memory[this.i + i];
                        }
                        this.i += X + 1;
                        this.pc += 2;
                        break;
                }
        }
    }

    /**
     * 获取用户输入
     * @returns 
     */
    getInput() {
        return this.key.indexOf(1);
    }

    setInput(k: string, val: number) {
        const key = k.toLocaleUpperCase();
        if (this.keyMap[key] === undefined) {
            return;
        }
        this.key[this.keyMap[key]] = val;
    }

    /**
     * 绘制指令 
     */
    draw(X: number, Y: number, N: number) {
        // console.log(X, Y, N);
        this.V[0xf] = 0;
        const row = X, col = Y;
        for (let i = 0; i < N; i++) {
            let sprite = this.memory[this.i + i];
            for (let j = 0; j < 8; j++) {

                const x = (row + j) % 64;
                const y = (col + i) % 32;

                const index = y * 64 + x;

                const bit = (sprite >> j) & 0x1;

                // 碰撞判断
                if (bit === 1 && this.gfx[index] === 1) {
                    this.V[0xf] = 1;
                }

                if (sprite & 0x80) {
                    if (this.gfx[index] === 1) {
                        this.V[0xf] = 1;
                    }
                    this.gfx[index] ^= 1;
                }
                sprite <<= 0x1;
            }
        }
    }


    ticker() {
        this.opCodeExec();
    }

    loadRom(rom: Uint8Array) {
        this.loadFonts();

        for (let i = 0; i < rom.length; i++) {
            this.memory[this.pc + i] = rom[i];
        }
        // setInterval(() => {
        //     this.ticker();
        // }, 0);

        this.run();
    }

    /**
    * 加载字体到chip8内存
    */
    loadFonts() {
        var fonts = [
            0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
            0x20, 0x60, 0x20, 0x20, 0x70, // 1
            0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
            0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
            0x90, 0x90, 0xF0, 0x10, 0x10, // 4
            0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
            0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
            0xF0, 0x10, 0x20, 0x40, 0x40, // 7
            0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
            0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
            0xF0, 0x90, 0xF0, 0x90, 0x90, // A
            0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
            0xF0, 0x80, 0x80, 0x80, 0xF0, // C
            0xE0, 0x90, 0x90, 0x90, 0xE0, // D
            0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
            0xF0, 0x80, 0xF0, 0x80, 0x80  // F
        ];
        for (var i = 0; i < fonts.length; i++) {
            this.memory[i] = fonts[i];
        }
    };

    run() {
        for (let i = 0; i < 9; i++) {
            this.ticker();
        }

        if (this.delayTimer > 0) {
            this.delayTimer--;
        }
        if (this.soundTimer > 0) {
            this.soundTimer--;
            if (this.soundTimer === 0) {
                console.log('[播放声音]蜂鸣声');
            }
        }
        this.render();
        setTimeout(() => {
            this.run()
        }, 1000 / 60);
    }

    canvas!: HTMLCanvasElement;
    setView(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d')!;
    }

    ctx!: CanvasRenderingContext2D;
    /**
     * 渲染
     */
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const cellWidth = this.canvas.width / 64;
        const cellHeight = this.canvas.height / 32;

        for (let x = 0; x < 64; x++) {
            for (let y = 0; y < 32; y++) {
                const index = y * 64 + x;

                if (this.gfx[index] === 1) {
                    ctx.fillStyle = '#27bf68';
                    ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
                }
            }
        }
    }
}