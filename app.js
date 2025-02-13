document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const results = document.getElementById('results');

    // Add iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
        // Modify dropzone text for iOS users
        dropZone.querySelector('p').textContent = 'Tap here to select audio file';
        dropZone.style.position = 'relative'; // Ensure proper positioning
        
        // Remove drag and drop for iOS
        ['dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.removeEventListener(eventName, e => e.preventDefault());
        });

        const iosButton = document.getElementById('iosButton');
        iosButton.style.display = 'block';
        iosButton.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const supportedTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/m4a'];
            const fileType = file.type.toLowerCase();
            
            // Also check file extension for iOS
            const fileName = file.name.toLowerCase();
            const isSupported = supportedTypes.includes(fileType) || 
                              fileName.endsWith('.mp3') || 
                              fileName.endsWith('.m4a') || 
                              fileName.endsWith('.wav');
            
            if (isSupported) {
                results.innerHTML = 'Processing audio file...';
                processAudioFile(file);
            } else {
                results.innerHTML = `Error: File type not supported. Please use MP3, M4A, or WAV files.`;
            }
        }
    });

    // Remove click handler as we're using direct input interaction
    dropZone.removeEventListener('click', () => {});

    // Make the entire drop zone clickable/tappable
    dropZone.style.cursor = 'pointer';
    
    // Add error handling for audio context
    async function processAudioFile(file) {
        let audioContext = null; // Define audioContext in wider scope
        try {
            results.innerHTML = 'Starting audio processing...';
            
            // Check file size for iOS
            const MAX_SIZE_MB = 25;
            if (isIOS && file.size > MAX_SIZE_MB * 1024 * 1024) {
                throw new Error(`File size too large for iOS. Please use files smaller than ${MAX_SIZE_MB}MB`);
            }

            // Create audio context with iOS-specific options
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'playback'
            });
            
            results.innerHTML = 'Loading audio file...';
            
            const arrayBuffer = await file.arrayBuffer();
            let audioBuffer;
            
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } catch (decodeError) {
                console.error('Initial decode failed:', decodeError);
                results.innerHTML = 'Trying alternative decode method...';
                
                const audioElement = new Audio();
                const objectUrl = URL.createObjectURL(file);
                audioElement.src = objectUrl;
                
                await new Promise((resolve, reject) => {
                    audioElement.onloadedmetadata = resolve;
                    audioElement.onerror = reject;
                });
                
                URL.revokeObjectURL(objectUrl);
                
                const duration = audioElement.duration;
                audioBuffer = audioContext.createBuffer(
                    2,
                    duration * audioContext.sampleRate,
                    audioContext.sampleRate
                );
            }
            
            const resultDiv = document.createElement('div');
            results.innerHTML = '';
            results.appendChild(resultDiv);
            
            const segmentDuration = 120;
            const sampleRate = audioBuffer.sampleRate;
            const samplesPerSegment = segmentDuration * sampleRate;
            const numberOfSegments = Math.ceil(audioBuffer.length / samplesPerSegment);
            
            let processedSegments = 0;
            
            for (let i = 0; i < numberOfSegments; i++) {
                resultDiv.innerHTML = `<div class="loading"></div>Processing segment ${i + 1} of ${numberOfSegments}...`;
                
                const startSample = i * samplesPerSegment;
                const endSample = Math.min((i + 1) * samplesPerSegment, audioBuffer.length);
                
                let segmentBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    endSample - startSample,
                    sampleRate
                );
                
                const CHUNK_SIZE = 50000;
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    const segmentData = segmentBuffer.getChannelData(channel);
                    
                    for (let j = 0; j < segmentData.length; j += CHUNK_SIZE) {
                        const chunk = Math.min(CHUNK_SIZE, segmentData.length - j);
                        segmentData.set(
                            channelData.slice(startSample + j, startSample + j + chunk),
                            j
                        );
                        
                        if (j % (CHUNK_SIZE * 4) === 0) {
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }
                }
                
                try {
                    const blob = await audioBufferToWav(segmentBuffer);
                    const url = URL.createObjectURL(blob);
                    
                    const segment = document.createElement('div');
                    segment.className = 'segment';
                    segment.innerHTML = `
                        <p>Segment ${i + 1}</p>
                        <audio controls src="${url}"></audio>
                        <a href="${url}" download="segment_${i + 1}.wav">Download</a>
                    `;
                    results.appendChild(segment);
                    
                    processedSegments++;
                    
                    segmentBuffer = null;
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (segmentError) {
                    console.error(`Error processing segment ${i + 1}:`, segmentError);
                    const errorDiv = document.createElement('div');
                    errorDiv.innerHTML = `<p>Error processing segment ${i + 1}: ${segmentError.message}</p>`;
                    results.appendChild(errorDiv);
                }
            }
            
            resultDiv.innerHTML = `Successfully processed ${processedSegments} of ${numberOfSegments} segments`;
            
        } catch (error) {
            console.error('Audio processing error:', error);
            results.innerHTML = `Error: ${error.message}. Please try a different audio file or browser.`;
        } finally {
            if (audioContext) {
                try {
                    await audioContext.close();
                } catch (e) {
                    console.error('Error closing audio context:', e);
                }
            }
        }
    }

    // Convert AudioBuffer to WAV format
    function audioBufferToWav(buffer) {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length * numberOfChannels * 2;
        const outputBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(outputBuffer);
        
        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, length, true);
        
        // Write audio data
        const offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(offset + (i * numberOfChannels + channel) * 2, sample * 0x7FFF, true);
            }
        }
        
        return new Blob([outputBuffer], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}); 