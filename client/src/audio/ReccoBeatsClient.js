export class ReccoBeatsClient {
    constructor() {
        this.baseUrl = 'https://api.reccobeats.com/v1';
    }

    /**
     * Uploads an audio file blob to extract features.
     * @param {Blob} audioBlob - The audio file as a Blob.
     * @returns {Promise<Object>} - The audio features (tempo, energy, valence, etc.)
     */
    async analyzeTrack(audioBlob) {
        // Fix: API has size limit (413). Slice to first 2MB.
        // Most decoders can handle truncated MP3s.
        const MAX_SIZE = 2 * 1024 * 1024; // 2MB
        let finalBlob = audioBlob;

        if (audioBlob.size > MAX_SIZE) {
            console.warn(`Audio too large (${(audioBlob.size / 1024 / 1024).toFixed(2)}MB). Truncating to 2MB for API.`);
            finalBlob = audioBlob.slice(0, MAX_SIZE, audioBlob.type);
        }

        const formData = new FormData();
        formData.append('audioFile', finalBlob);

        try {
            const response = await fetch(`${this.baseUrl}/analysis/audio-features`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`ReccoBeats API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('ReccoBeats Analysis Result:', data);
            return data;
        } catch (error) {
            console.error('Failed to analyze track with ReccoBeats:', error);
            return null;
        }
    }
}
