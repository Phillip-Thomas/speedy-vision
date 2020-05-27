/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for the web
 * Copyright 2020 Alexandre Martins <alemartf(at)gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * convolution.js
 * Convolution function generator
 */

import { Utils } from "../../../utils/utils";
import { normalizeGaussianKernel } from "./gaussian";
const cartesian = (a, b) => [].concat(...a.map(a => b.map(b => [a,b]))); // [a] x [b]
const symmetricRange = n => [...Array(2*n + 1).keys()].map(x => x-n);    // [-n, ..., n]

// Generate a 2D convolution with a square kernel
export function conv2D(kernel, normalizationConstant = 1.0)
{
    const kernel32 = new Float32Array(kernel.map(x => (+x) * (+normalizationConstant)));
    const kSize = Math.sqrt(kernel32.length) | 0;
    const N = (kSize / 2) | 0;

    // validate input
    if(kSize < 1 || kSize % 2 == 0)
        Utils.fatal(`Can't perform a 2D convolution with an invalid kSize of ${kSize}`);
    else if(kSize * kSize != kernel32.length)
        Utils.fatal(`Invalid 2D convolution kernel of ${kernel32.length} elements (expected: square)`);

    // code generator
    const foreachKernelElement = fn => cartesian(symmetricRange(N), symmetricRange(N)).reduce(
        (acc, cur) => acc + fn(kernel32[(cur[0] + N) * kSize + (cur[1] + N)], cur[0], cur[1]),
    '');
    const generateCode = (k, i, j) => `
    y = Math.min(Math.max(this.thread.y + (${i | 0}), 0), height - 1);
    x = Math.min(Math.max(this.thread.x + (${j | 0}), 0), width - 1);
    p = image[y][x]; r += p[0] * ${+k}; g += p[1] * ${+k}; b += p[2] * ${+k};
    `;

    // shader
    const body = `
    const width = this.constants.width;
    const height = this.constants.height;
    const pixel = image[this.thread.y][this.thread.x];
    let r = 0.0, g = 0.0, b = 0.0;
    let p = [0.0, 0.0, 0.0, 0.0];
    let x = 0, y = 0;
    ${foreachKernelElement(generateCode)}
    this.color(r, g, b, pixel[3]);
    `;

    return new Function('image', body);
}

// Generate a 1D convolution function on the x-axis
export function convX(kernel, normalizationConstant = 1.0)
{
    return conv1D('x', kernel, normalizationConstant);
}

// Generate a 1D convolution function on the y-axis
export function convY(kernel, normalizationConstant = 1.0)
{
    return conv1D('y', kernel, normalizationConstant);
}

// Generate a texture-based 1D convolution function on the x-axis
export const texConvX = texConv1D('x');

// Generate a texture-based 1D convolution function on the x-axis
export const texConvY = texConv1D('y');

// 1D convolution function generator
function conv1D(axis, kernel, normalizationConstant)
{
    const kernel32 = new Float32Array(kernel.map(x => (+x) * (+normalizationConstant)));
    const kSize = kernel32.length;
    const N = (kSize / 2) | 0;

    // validate input
    if(kSize < 1 || kSize % 2 == 0)
        Utils.fatal(`Can't perform a 1D convolution with an invalid kSize of ${kSize}`);
    else if(axis != 'x' && axis != 'y')
        Utils.fatal(`Can't perform 1D convolution: invalid axis "${axis}"`); // this should never happen

    // code generator
    const foreachKernelElement = fn => symmetricRange(N).reduce(
        (acc, cur) => acc + fn(kernel32[cur + N], cur),
    '');
    const generateCode = (k, i) => (((axis == 'x') ? `
    y = this.thread.y;
    x = Math.min(Math.max(this.thread.x + (${i | 0}), 0), width - 1);
    ` : `
    y = Math.min(Math.max(this.thread.y + (${i | 0}), 0), height - 1);
    x = this.thread.x;
    `) + `
    p = image[y][x]; r += p[0] * ${+k}; g += p[1] * ${+k}; b += p[2] * ${+k};
    `);

    // shader
    const body = `
    const width = this.constants.width;
    const height = this.constants.height;
    const pixel = image[this.thread.y][this.thread.x];
    let r = 0.0, g = 0.0, b = 0.0;
    let p = [0.0, 0.0, 0.0, 0.0];
    let x = 0, y = 0;
    ${foreachKernelElement(generateCode)}
    this.color(r, g, b, pixel[3]);
    `;

    return new Function('image', body);
}

// texture-based 1D convolution function generator
// (the convolution kernel is stored in a texture)
function texConv1D(axis)
{
    // validate input
    if(axis != 'x' && axis != 'y')
        Utils.fatal(`Can't perform tex 1D convolution: invalid axis "${axis}"`); // this should never happen

    // code
    const body = `
    const N = Math.floor(kSize / 2);
    const width = this.constants.width;
    const height = this.constants.height;
    const pixel = image[this.thread.y][this.thread.x];
    let r = 0.0, g = 0.0, b = 0.0;
    let p = [0.0, 0.0, 0.0, 0.0];
    let k = [0.0, 0.0, 0.0, 0.0];
    let x = this.thread.x, y = this.thread.y;

    for(let i = -N; i <= N; i++) {
    ` + ((axis == 'x') ? `
        x = Math.max(0, Math.min(this.thread.x + i, width - 1));
    ` : `
        y = Math.max(0, Math.min(this.thread.y + i, height - 1));
    ` ) + `

        p = image[y][x];
        k = texKernel[0][i + N];

        r += p[0] * (k[0] * scale + offset);
        g += p[1] * (k[1] * scale + offset);
        b += p[2] * (k[2] * scale + offset);
    }

    this.color(r, g, b, pixel[3]);
    `;

    // image: target image
    // texKernel: convolution kernel (all entries in [0,1])
    // kSize: kernel size, odd positive integer (it won't be checked!)
    // scale: multiply the kernel entries by a number (like 1.0)
    // offset: add a number to all kernel entries (like 0.0)
    return new Function('image', 'texKernel', 'kSize', 'scale', 'offset', body);
}