export const SONG_LIBRARY = {
    'move_your_body.mp3': {
        title: 'Hedex - Move Your Body',
        fallbackFeatures: {
            acousticness: 0.3354,
            danceability: 0.5219,
            energy: 0.7691,
            instrumentalness: 0.0159,
            liveness: 0.1956,
            loudness: -6.019,
            speechiness: 0.0745,
            tempo: 152.8296,
            valence: 0.4701,
            colorHint: 'neon_green'
        }
    },
    'killing_me_softly.mp3': {
        title: 'Fugees - Killing Me Softly With His Song',
        fallbackFeatures: {
            acousticness: 0.9144,
            danceability: 0.3726,
            energy: 0.0837,
            instrumentalness: 0.0074,
            liveness: 0.1157,
            loudness: -16.101,
            speechiness: 0.0441,
            tempo: 109.243,
            valence: 0.1163,
            colorHint: 'deep_red'
        }
    },
    'Homecoming.mp3': {
        title: 'Kanye West - Homecoming',
        fallbackFeatures: {
            acousticness: 0.337,
            danceability: 0.5833,
            energy: 0.6632,
            instrumentalness: 0.0072,
            liveness: 0.1514,
            loudness: -7.5761,
            speechiness: 0.0885,
            tempo: 143.3948,
            valence: 0.4897,
            colorHint: 'magenta'
        }
    },
    'like_a_prayer.mp3': {
        title: 'Madonna - Like a Prayer',
        fallbackFeatures: {
            acousticness: 0.9351,
            danceability: 0.2879,
            energy: 0.2638,
            instrumentalness: 0.0131,
            liveness: 0.1506,
            loudness: -12.4894,
            speechiness: 0.042,
            tempo: 95.9867,
            valence: 0.1191,
            colorHint: 'golden_yellow'
        }
    },
    'Children.mp3': {
        title: 'Robert Miles - Children',
        fallbackFeatures: {
            acousticness: 0.6766,
            danceability: 0.3857,
            energy: 0.2819,
            instrumentalness: 0.8665,
            liveness: 0.1095,
            loudness: -17.6734,
            speechiness: 0.0382,
            tempo: 111.464,
            valence: 0.0848,
            colorHint: 'misty_purple'
        }
    }
};

export const SONG_ORDER = [
    'Homecoming.mp3',
    'Children.mp3',
    'killing_me_softly.mp3',
    'like_a_prayer.mp3',
    'move_your_body.mp3'
];

export const DEFAULT_SONG = 'Homecoming.mp3';

export function getSongDisplayName(fileName) {
    return SONG_LIBRARY[fileName]?.title || fileName;
}

