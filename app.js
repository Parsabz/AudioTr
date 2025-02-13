document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const results = document.getElementById('results');

    // Handle drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#f5f5f5';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
            processAudioFile(file);
        }
    });

    // Handle click to upload
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('audio/')) {
            processAudioFile(file);
        }
    });

    async function processAudioFile(file) {
        try {
            results.innerHTML = 'Processing audio file...';
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const segmentDuration = 120; // 2 minutes in seconds
            const sampleRate = audioBuffer.sampleRate;
            const samplesPerSegment = segmentDuration * sampleRate;
            const numberOfSegments = Math.ceil(audioBuffer.length / samplesPerSegment);
            
            results.innerHTML = '';
            
            for (let i = 0; i < numberOfSegments; i++) {
                const startSample = i * samplesPerSegment;
                const endSample = Math.min((i + 1) * samplesPerSegment, audioBuffer.length);
                
                const segmentBuffer = new AudioBuffer({
                    numberOfChannels: audioBuffer.numberOfChannels,
                    length: endSample - startSample,
                    sampleRate: sampleRate
                });
                
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    const segmentData = segmentBuffer.getChannelData(channel);
                    segmentData.set(channelData.slice(startSample, endSample));
                }
                
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
            }
        } catch (error) {
            results.innerHTML = `Error processing audio: ${error.message}`;
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