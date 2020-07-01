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
 * pipeline.js
 * Unit testing
 */

describe('SpeedyPipeline', function() {
    let media;

    beforeEach(function() {
        jasmine.addMatchers(speedyMatchers);
    });

    beforeEach(async function() {
        const image = await loadImage('speedy-wall.jpg');
        media = await Speedy.load(image);
    });

    it('is a SpeedyPipeline object', function() {
        const pipeline = Speedy.pipeline();
        
        expect(typeof pipeline).toBe('object');
        expect(pipeline.constructor.name).toBe('SpeedyPipeline');
    });

    it('accepts the concatenation of pipelines', function() {
        const pipeline = Speedy.pipeline();
        const pl = Speedy.pipeline().blur();

        expect(pipeline.length).toBe(0);
        pipeline.concat(pl);
        expect(pipeline.length).toBe(1);
        pipeline.concat(pl);
        expect(pipeline.length).toBe(2);
        pipeline.concat(pl).concat(pl);
        expect(pipeline.length).toBe(4);
        pipeline.concat(pipeline);
        expect(pipeline.length).toBe(8);
    });

    it('does nothing if the pipeline is empty', async function() {
        const pipeline = Speedy.pipeline();
        const sameMedia = await media.run(pipeline);

        const error = imerr(media, sameMedia);

        display(media, 'Original image');
        display(sameMedia, 'After going through the GPU');
        display(imdiff(media, sameMedia), `Error: ${error}`);

        expect(media.width).toBe(sameMedia.width);
        expect(media.height).toBe(sameMedia.height);
        expect(error).toBeAnAcceptableImageError();
    });

    it('converts to greyscale', async function() {
        const pipeline = Speedy.pipeline().convertTo('greyscale');
        const greyscale = await media.run(pipeline);

        display(media);
        display(greyscale);

        // RGB channels are the same
        const rgb = pixels(greyscale).filter((p, i) => i % 4 < 3);
        const rrr = Array(rgb.length).fill(0).map((_, i) => rgb[3 * ((i/3)|0)]);
        expect(rgb).toBeElementwiseEqual(rrr);

        // Not equal to the original media
        const pix = pixels(media).filter((p, i) => i % 4 < 3);
        expect(pix).not.toBeElementwiseNearlyEqual(rrr);
    });

    it('blurs an image', async function() {

        const filters = ['gaussian', 'box'];
        const sizes = [3, 5, 7];

        display(media, 'Original image');

        for(const filter of filters) {
            let lastError = 1e-5;
            print();

            for(const size of sizes) {
                const pipeline = Speedy.pipeline().blur({ filter , size });
                const blurred = await media.clone().run(pipeline);

                const error = imerr(blurred, media);
                display(blurred, `Used ${filter} filter with kernel size = ${size}. Error: ${error}`);

                // no FFT...
                expect(error).toBeGreaterThan(lastError);
                expect(error).toBeLessThan(0.2);

                lastError = error;
            }
        }

    });

    describe('Convolution', function() {
        let square, pipelines;
        const convolution = kernel => (pipelines = [...pipelines, Speedy.pipeline().convolve(kernel)])[pipelines.length - 1];

        beforeEach(async function() {
            square = await Speedy.load(await loadImage('square.png'));
            pipelines = [];
        });

        afterEach(async function() {
            for(const pipeline of pipelines)
                await pipeline.release();
        });

        it('convolves with identity kernels', async function() {
            const convolved3x3 = await square.run(convolution([
                0, 0, 0,
                0, 1, 0,
                0, 0, 0,
            ]));

            const convolved5x5 = await square.clone().run(convolution([
                0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 1, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
            ]));

            const convolved7x7 = await square.clone().run(convolution([
                0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 1, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0,
            ]));

            display(square, 'Original image');
            display(convolved3x3, 'Convolution 3x3');
            display(imdiff(square, convolved3x3), 'Difference');
            print();
            display(square, 'Original image');
            display(convolved5x5, 'Convolution 5x5');
            display(imdiff(square, convolved5x5), 'Difference');
            print();
            display(square, 'Original image');
            display(convolved7x7, 'Convolution 7x7');
            display(imdiff(square, convolved7x7), 'Difference');

            expect(pixels(convolved3x3))
            .toBeElementwiseNearlyEqual(pixels(square));

            expect(pixels(convolved5x5))
            .toBeElementwiseNearlyEqual(pixels(square));

            expect(pixels(convolved7x7))
            .toBeElementwiseNearlyEqual(pixels(square));
        });

        it('doesn\'t accept kernels with invalid sizes', function() {
            [0, 2, 4, 6, 8, 10, 12].forEach(kernelSize => {
                expect(() => {
                    const pipeline = Speedy.pipeline().convolve(Array(kernelSize * kernelSize).fill(0));
                }).toThrow();
            });
        });

        it('brightens an image', async function() {
            const pipeline = Speedy.pipeline()
                                   .convolve([
                                       0, 0, 0,
                                       0,1.5,0,
                                       0, 0, 0,
                                   ]);
            const brightened = await media.run(pipeline);
            const groundTruth = await Speedy.load(createCanvasFromPixels(
                media.width, media.height,
                pixels(media).map(p => p * 1.5)
            ));

            const error = imerr(groundTruth, brightened);

            display(groundTruth, 'Ground truth');
            display(brightened, 'Image brightened by Speedy');
            display(imdiff(brightened, groundTruth), `Error: ${error}`);

            expect(error).toBeAnAcceptableImageError();
        });

        it('darkens an image', async function() {
            const pipeline = Speedy.pipeline()
                                   .convolve([
                                       0, 0, 0,
                                       0,.5, 0,
                                       0, 0, 0,
                                   ]);
            const darkened = await media.run(pipeline);
            const groundTruth = await Speedy.load(createCanvasFromPixels(
                media.width, media.height,
                pixels(media).map(p => p * 0.5)
            ));

            const error = imerr(groundTruth, darkened);

            display(groundTruth, 'Ground truth');
            display(darkened, 'Image darkened by Speedy');
            display(imdiff(darkened, groundTruth), `Error: ${error}`);

            expect(error).toBeAnAcceptableImageError();
        });

        it('accepts chains of convolutions', async function() {
            const pipeline = Speedy.pipeline()
                                   .convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]);
            const convolved = await square.run(pipeline);

            const error = imerr(square, convolved);

            display(square, 'Original');
            display(convolved, 'Convolved');
            display(imdiff(convolved, square), `Error: ${error}`);

            expect(pixels(square))
            .toBeElementwiseNearlyEqual(pixels(convolved));
        });

        it('accepts chains of convolutions of different sizes', async function() {
            const pipeline = Speedy.pipeline()
                                   .convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 1, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 1, 0, 0, 0,
                                       0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0,
                                       0, 1, 0,
                                       0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 1, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                   ]).convolve([
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 1, 0, 0,
                                       0, 0, 0, 0, 0,
                                       0, 0, 0, 0, 0,
                                   ]);
            const convolved = await square.run(pipeline);

            const error = imerr(square, convolved);

            display(square, 'Original');
            display(convolved, 'Convolved');
            display(imdiff(convolved, square), `Error: ${error}`);

            expect(pixels(square))
            .toBeElementwiseNearlyEqual(pixels(convolved));
        });

        it('convolves with a Sobel filter', async function() {
            const sobelX = await Speedy.load(await loadImage('square-sobel-x.png'));
            const sobelY = await Speedy.load(await loadImage('square-sobel-y.png'));

            const mySobelX = await square.run(convolution([
                -1, 0, 1,
                -2, 0, 2,
                -1, 0, 1,
            ]));

            const mySobelY = await square.clone().run(convolution([
                1, 2, 1,
                0, 0, 0,
               -1,-2,-1,
            ]));

            const errorX = imerr(sobelX, mySobelX);
            const errorY = imerr(sobelY, mySobelY);

            display(sobelX, 'Ground truth');
            display(mySobelX, 'Sobel filter computed by Speedy');
            display(imdiff(sobelX, mySobelX), `Error: ${errorX}`);
            print();
            display(sobelY, 'Ground truth');
            display(mySobelY, 'Sobel filter computed by Speedy');
            display(imdiff(sobelY, mySobelY), `Error: ${errorY}`);
            print();
            display(square, 'Original image');

            expect(errorX).toBeAnAcceptableImageError(2);
            expect(errorY).toBeAnAcceptableImageError(2);
        });

        it('captures outlines', async function() {
            const outline = await Speedy.load(await loadImage('square-outline.png'));
            const myOutline = await square.run(convolution([
                -1,-1,-1,
                -1, 8,-1,
                -1,-1,-1,
            ]));

            const error = imerr(outline, myOutline);

            display(square, 'Original image');
            display(outline, 'Ground truth');
            display(myOutline, 'Outline computed by Speedy');
            display(imdiff(outline, myOutline), `Error: ${error}`);

            expect(error).toBeAnAcceptableImageError();
        });

    });

});