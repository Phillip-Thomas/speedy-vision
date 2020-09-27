/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for JavaScript
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
 * feature-detection-algorithm.js
 * Feature detection & description: abstract class
 */

import { AbstractMethodError } from '../../utils/errors';
import { AutomaticSensitivity } from './automatic-sensitivity';
import { FeatureAlgorithm } from './feature-algorithm';
import { SpeedyFeature } from '../speedy-feature';
import { SpeedyGPU } from '../../gpu/speedy-gpu';

/**
 * An abstract class for feature
 * detection & description
 * @abstract
 */
export class FeatureDetectionAlgorithm extends FeatureAlgorithm
{
    /**
     * Class constructor
     */
    constructor()
    {
        super();
        this._sensitivity = 0;
        this._automaticSensitivity = null;
        this._useBufferQueue = true;
    }

    /**
     * The size in bytes of the feature descriptor
     * This method may be overridden in subclasses
     * 
     * It must return 0 if the algorithm has no
     * descriptor attached to it
     *
     * @returns {number} descriptor size in bytes
     */
    get descriptorSize()
    {
        // This must be implemented in subclasses
        throw new AbstractMethodError();
    }

    /**
     * Convert a normalized sensitivity into an
     * algorithm-specific value such as a threshold
     * 
     * Sensitivity is a generic parameter that can be
     * mapped to different feature detectors. The
     * higher the sensitivity, the more features
     * you should get
     *
     * @param {number} sensitivity a value in [0,1]
     */
    _onSensitivityChange(sensitivity)
    {
        // This must be implemented in subclasses
        throw new AbstractMethodError();
    }

    /**
     * Detect feature points
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} inputTexture pre-processed greyscale image
     * @returns {SpeedyTexture} tiny texture with encoded keypoints
     */
    detect(gpu, inputTexture)
    {
        // This must be implemented in subclasses
        throw new AbstractMethodError();
    }

    /**
     * Describe feature points
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} inputTexture pre-processed greyscale image
     * @param {SpeedyTexture} detectedKeypoints tiny texture with appropriate size for the descriptors
     * @returns {SpeedyTexture} tiny texture with encoded keypoints & descriptors
     */
    describe(gpu, inputTexture, detectedKeypoints)
    {
        // No descriptor is computed by default
        return detectedKeypoints;
    }

    /**
     * Download feature points from the GPU
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} encodedKeypoints tiny texture with encoded keypoints
     * @param {number} [max] cap the number of keypoints to this value
     * @param {boolean} [useAsyncTransfer] transfer feature points asynchronously
     * @returns {Promise<SpeedyFeature[]>}
     */
    download(gpu, encodedKeypoints, max = undefined, useAsyncTransfer = true)
    {
        return this._downloader.download(gpu, encodedKeypoints, this.descriptorSize, max, useAsyncTransfer, this._useBufferQueue);
    }

    /**
     * Reset the capacity of the keypoint downloader
     * @param {SpeedyGPU} gpu 
     */
    resetDownloader(gpu)
    {
        this._downloader.reset(gpu, this.descriptorSize);
        // maybe you want to disable the buffer queue?
    }

    /**
     * Get the current detector sensitivity
     * @returns {number} a value in [0,1]
     */
    get sensitivity()
    {
        return this._sensitivity;
    }

    /**
     * Set the sensitivity of the feature detector
     * The higher the sensitivity, the more features you get
     * @param {number} sensitivity a value in [0,1]
     */
    set sensitivity(sensitivity)
    {
        this._sensitivity = Math.max(0, Math.min(+sensitivity, 1));
        this._onSensitivityChange(this._sensitivity);
    }

    /**
     * Automatic sensitivity: expected number of keypoints
     * @returns {object|undefined}
     */
    get expected()
    {
        if(this._automaticSensitivity == null) {
            return {
                number: this._automaticSensitivity.expected,
                tolerance: this._automaticSensitivity.tolerance
            };
        }
        else
            return undefined;
    }

    /**
     * Setup automatic sensitivity
     * @param {number|object|undefined} expected
     */
    set expected(expected)
    {
        if(expected !== undefined) {
            // enable automatic sensitivity
            if(this._automaticSensitivity == null) {
                this._automaticSensitivity = new AutomaticSensitivity(this._downloader);
                this._automaticSensitivity.subscribe(value => this.sensitivity = value);
            }

            // set parameters
            if(typeof expected === 'object') {
                if(expected.hasOwnProperty('number'))
                    this._automaticSensitivity.expected = +(expected.number);
                if(expected.hasOwnProperty('tolerance'))
                    this._automaticSensitivity.tolerance = +(expected.tolerance);
            }
            else
                this._automaticSensitivity.expected = +expected;
        }
        else {
            // disable automatic sensitivity
            if(this._automaticSensitivity != null)
                this._automaticSensitivity.disable();
            this._automaticSensitivity = null;
        }
    }

    /**
     * Enable the buffer queue optimization
     * It's an optimization technique that implies a 1-frame delay
     * in the downloads when using async transfers; it may or may
     * not be acceptable, depending on what you're trying to do
     */
    enableBufferQueue()
    {
        this._useBufferQueue = true;
    }

    /**
     * Disable the buffer queue optimization
     * It's an optimization technique that implies a 1-frame delay
     * in the downloads when using async transfers; it may or may
     * not be acceptable, depending on what you're trying to do
     */
    disableBufferQueue()
    {
        this._useBufferQueue = false;
    }

    /**
     * Whether we're using the buffer queue optimization or not
     * @returns {boolean}
     */
    isBufferQueueEnabled()
    {
        return this._useBufferQueue;
    }
}