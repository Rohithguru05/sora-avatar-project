

// --- DOM Elements ---
const avatarContainer = document.getElementById('avatar-container');
const voiceAudio = document.getElementById('voice-audio');
const speaker1Btn = document.getElementById('speaker1-btn');
const speaker2Btn = document.getElementById('speaker2-btn');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');

// --- Global Variables ---
let americanVisemeData = [];
let indianVisemeData = [];
let activeVisemeData = []; // either americanVisemeData or indianVisemeData
let currentVisemeIndex = 0; // Tracks the current position in the activeVisemeData array
let svgFilesContent = new Map(); // Stores preloaded SVG content
let animationFrameId = null; // Stores the ID of the requestAnimationFrame loop
let currentSpeaker = null; // Tracks the currently active speaker ('American' or 'Indian')


const AVATAR_IMAGES_PATH = 'Soralink_avatar_images/'; 
const VOICE_VISEME_PATH = 'Avatar_voice_viseme-ID/'; 

// --- Viseme ID to SVG Filename Mapping ---

const visemeToSvgFilenameMap = {
    "0": "SVG_0.svg",  
    "1": "SVG_1.svg", 
    "2": "SVG_2.svg", 
    "3": "SVG_3.svg",  
    "4": "SVG_4.svg",  
    "5": "SVG_5.svg",  
    "6": "SVG_6.svg",  
    "7": "SVG_7.svg",  
    "8": "SVG_8.svg",  
    "9": "SVG_9.svg",  
    "10": "SVG_10.svg", 
    "11": "SVG_11.svg", 
    "12": "SVG_12.svg", 
    "13": "SVG_13.svg",
    "14": "SVG_14.svg", 
    "15": "SVG_15.svg", 
    "16": "SVG_16.svg", 
    "17": "SVG_17.svg", 
    "18": "SVG_18.svg", 
    "19": "SVG_19.svg", 
    "20": "SVG_20.svg", 
    "21": "SVG_21.svg"  
};

const IDLE_VISEME_ID = "0";


function showLoading(message) {
    loadingMessage.textContent = message;
    errorMessage.textContent = ''; 
    speaker1Btn.disabled = true;
    speaker2Btn.disabled = true;
}


function hideLoading() {
    loadingMessage.textContent = '';
    speaker1Btn.disabled = false;
    speaker2Btn.disabled = false;
}


function showErrorMessage(message) {
    errorMessage.textContent = message;
    hideLoading(); 
}


function clearMessages() {
    loadingMessage.textContent = '';
    errorMessage.textContent = '';
}


function setActiveButton(button) {
    speaker1Btn.classList.remove('active');
    speaker2Btn.classList.remove('active');
    if (button) {
        button.classList.add('active');
    }
}


// --- Core Functions ---

/**
 * Fetches and processes JSON data from a given path.
 * This function is now more robust and can handle two JSON structures:
 * 1. An array of objects: [{offset: X, viseme_id: Y}, ...]
 * 2. An object with numeric string keys: {"0": {offset: X, viseme_id: Y}, "1": {...}, ...}
 * It ensures 'viseme_id' is a string and sorts data by 'offset'.
 * @param {string} path - The path to the JSON file.
 * @returns {Promise<Array>} A promise that resolves with the parsed and formatted viseme data.
 */
async function fetchJsonData(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} from ${path}`);
        }
        const rawData = await response.json();
        console.log(`Successfully fetched JSON from ${path}. Raw data type: ${Array.isArray(rawData) ? 'Array' : 'Object'}.`);

        let processedData = [];

        if (Array.isArray(rawData)) {
            // Case 1: JSON is already an array (like American_viseme.json)
            processedData = rawData;
        } else if (typeof rawData === 'object' && rawData !== null) {
            // Case 2: JSON is an object with numerical string keys (like some outputs for Indian_viseme.json)
            console.warn(`Converting object-based JSON structure to array for ${path}.`);
            for (const key in rawData) {
                if (Object.hasOwnProperty.call(rawData, key)) {
                    processedData.push(rawData[key]);
                }
            }
        } else {
            throw new Error('Unexpected JSON data format: neither array nor object.');
        }

        // --- Common Processing for both formats ---
        // Ensure viseme_id is string for map lookup (as our map keys are strings)
        
        processedData = processedData.map(v => {
            let offset = v.offset;
            let visemeId = v.viseme_id;

            // Extract number from "np.int64(X)" string if present
            if (typeof offset === 'string' && offset.startsWith('np.int64(')) {
                offset = parseFloat(offset.substring(9, offset.length - 1));
            }
            if (typeof visemeId === 'string' && visemeId.startsWith('np.int64(')) {
                visemeId = String(parseFloat(visemeId.substring(9, visemeId.length - 1)));
            }
            
           
            return {
                offset: offset,
                viseme_id: String(visemeId)
            };
        }).filter(v => typeof v.offset === 'number' && !isNaN(v.offset)); // Filter out invalid entries

        // Sort by offset to ensure correct playback order
        processedData.sort((a, b) => a.offset - b.offset);

        console.log(`First 5 processed visemes for ${path.split('/').pop()}:`, processedData.slice(0, 5));
        console.log(`Total processed visemes for ${path.split('/').pop()}:`, processedData.length);
        return processedData;

    } catch (error) {
        console.error(`Could not fetch or process JSON data from ${path}:`, error);
        showErrorMessage(`Failed to load or process viseme data: ${path.split('/').pop()}. Check console for details.`);
        return []; // Return empty array on error
    }
}

/**
 * Preloads all SVG avatar images into memory for quick display.
 */
async function preloadAllSvgs() {
    showLoading('Loading avatar assets...');
    const svgPromises = [];
    // Get unique filenames from the mapping to avoid redundant fetches
    const uniqueSvgFilenames = [...new Set(Object.values(visemeToSvgFilenameMap))];

    for (const filename of uniqueSvgFilenames) {
        const path = `${AVATAR_IMAGES_PATH}${filename}`;
        svgPromises.push(
            fetch(path)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} from ${path}`);
                    }
                    return response.text();
                })
                .then(svgContent => {
                    svgFilesContent.set(filename, svgContent);
                })
                .catch(error => {
                    console.error(`Failed to load SVG ${filename}:`, error);
                    showErrorMessage(`Failed to load avatar part: ${filename}. Please check file names and paths.`);
                })
        );
    }
    // Wait for all SVG fetches to complete
    await Promise.all(svgPromises);
    hideLoading();
    console.log('All SVG files preloaded.');
}

/**
 * Displays the appropriate mouth shape SVG based on the given viseme ID.
 * @param {string} visemeId - The numerical ID of the viseme to display.
 */
function displayMouthShape(visemeId) {
    const svgFilename = visemeToSvgFilenameMap[visemeId];

    if (!svgFilename) {
        console.warn(`No SVG filename mapped for viseme ID: ${visemeId}. Falling back to idle.`);
        visemeId = IDLE_VISEME_ID; // Fallback to idle viseme
        const idleSvgFilename = visemeToSvgFilenameMap[visemeId]; // Get idle SVG filename
        if (idleSvgFilename && svgFilesContent.has(idleSvgFilename)) {
            avatarContainer.innerHTML = svgFilesContent.get(idleSvgFilename);
        } else {
            avatarContainer.innerHTML = ''; // Fallback to empty if idle also not found
        }
        return;
    }

    const svgContent = svgFilesContent.get(svgFilename);
    if (svgContent) {
        avatarContainer.innerHTML = svgContent;
    } else {
        // This error indicates SVG was supposed to be preloaded but isn't in the map
        console.error(`SVG content for filename '${svgFilename}' (viseme ID: ${visemeId}) not found in preloaded content. This indicates a preloading failure or incorrect mapping.`);
        showErrorMessage(`Error displaying avatar part: ${svgFilename}.`);
        // Attempt to show idle mouth as a last resort
        const idleSvgFilename = visemeToSvgFilenameMap[IDLE_VISEME_ID];
        if (idleSvgFilename && svgFilesContent.has(idleSvgFilename)) {
            avatarContainer.innerHTML = svgFilesContent.get(idleSvgFilename);
        } else {
            avatarContainer.innerHTML = ''; // Fallback to empty if idle also not found
        }
    }
}

/**
 * The main animation loop that updates mouth shapes based on audio time.
 */
function updateMouthShapeAnimation() {
    // Only update if audio is playing and there's viseme data
    if (!voiceAudio.paused && activeVisemeData.length > 0) {
        const audioTimeMs = voiceAudio.currentTime * 1000; // Convert audio time to milliseconds

        // Iterate through viseme data from the current index onwards
        for (let i = currentVisemeIndex; i < activeVisemeData.length; i++) {
            const viseme = activeVisemeData[i];
            // Check if the current audio time has passed the viseme's offset
            if (audioTimeMs >= viseme.offset) {
                displayMouthShape(viseme.viseme_id); // Display the corresponding mouth shape
                currentVisemeIndex = i; // Update index to avoid re-processing past visemes
            } else {
                // Since visemes are sorted by offset, we can stop if we haven't reached the next one yet
                break;
            }
        }
    }
  
    animationFrameId = requestAnimationFrame(updateMouthShapeAnimation);
}

/**
 * Handles speaker selection, loads audio, sets active viseme data, and starts playback.
 * @param {string} speakerName - The name of the speaker ('American' or 'Indian').
 */
async function selectSpeaker(speakerName) {
    clearMessages(); 
    showLoading(`Loading ${speakerName} voice...`);
    console.log(`Selecting speaker: ${speakerName}`);

    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    voiceAudio.pause();
    voiceAudio.currentTime = 0; 

    
    if (speakerName === 'American') {
        setActiveButton(speaker1Btn);
        voiceAudio.src = `${VOICE_VISEME_PATH}American_voice.wav`;
        activeVisemeData = americanVisemeData;
    } else if (speakerName === 'Indian') {
        setActiveButton(speaker2Btn);
        voiceAudio.src = `${VOICE_VISEME_PATH}Indian_voice.wav`;
        activeVisemeData = indianVisemeData;
    } else {
        console.error("Invalid speaker name provided.");
        showErrorMessage("Invalid speaker selected.");
        return;
    }
    currentSpeaker = speakerName;

    currentVisemeIndex = 0; 
    displayMouthShape(IDLE_VISEME_ID);

    voiceAudio.load(); 
   
    voiceAudio.oncanplaythrough = () => {
        hideLoading();
        console.log(`Audio for ${speakerName} is ready to play. Attempting to play.`);
        
        voiceAudio.play().catch(e => {
            console.error(`Error attempting to autoplay audio for ${speakerName}:`, e);
            showErrorMessage(`Autoplay failed for ${speakerName} speaker. Please click play on the audio player.`);
        });
    };
    
    voiceAudio.onerror = (e) => {
        console.error(`Error loading or playing audio for ${speakerName}:`, e);
        showErrorMessage(`Could not load ${speakerName} audio. Check file path or console.`);
        displayMouthShape(IDLE_VISEME_ID); 
        hideLoading();
    };
}

// --- Event Listeners ---
speaker1Btn.addEventListener('click', () => selectSpeaker('American'));
speaker2Btn.addEventListener('click', () => selectSpeaker('Indian'));

// Event listener for native audio play button
voiceAudio.addEventListener('play', () => {
    console.log('Native audio play event detected. Starting animation.');
    clearMessages();

    // Ensure activeVisemeData is correctly set if play initiated via native controls
    // This handles cases where user directly clicks native play button without clicking speaker button first
    if (!activeVisemeData.length && currentSpeaker) {
        activeVisemeData = (currentSpeaker === 'American') ? americanVisemeData : indianVisemeData;
    } else if (!currentSpeaker) {
        // If no speaker selected yet, default to American (or show error)
        console.warn('Native play initiated without speaker selection. Defaulting to American.');
        selectSpeaker('American').then(() => {
             // If selectSpeaker auto-plays, then the below won't be needed as animationFrameId will be set
        }).catch(err => {
            console.error('Failed to auto-select American speaker on native play:', err);
            showErrorMessage('Please select a speaker first.');
        });
        return; 
    }

    const audioTimeMs = voiceAudio.currentTime * 1000;
    // CRITICAL: Reset currentVisemeIndex to find the correct starting point if seeking
    // This loop ensures that if the user seeks in the audio, animation starts from the correct viseme.
    currentVisemeIndex = 0; 
    for (let i = 0; i < activeVisemeData.length; i++) {
        if (activeVisemeData[i] && audioTimeMs < activeVisemeData[i].offset) {
            currentVisemeIndex = Math.max(0, i - 1); 
            break;
        }
        currentVisemeIndex = i; 
    }

    // Start the animation loop if it's not already running
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(updateMouthShapeAnimation);
    }
});

// Event listener for native audio pause button
voiceAudio.addEventListener('pause', () => {
    console.log('Native audio pause event detected. Stopping animation.');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
});

// Event listener for when audio playback ends
voiceAudio.addEventListener('ended', () => {
    console.log('Audio ended. Stopping animation and resetting to idle.');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    displayMouthShape(IDLE_VISEME_ID);
    currentVisemeIndex = 0;
    setActiveButton(null); 
    clearMessages();
});


// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing app...');

    showLoading('Initializing avatar...');

    // Preload all SVG images
    await preloadAllSvgs();

    // Fetch viseme data for both speakers in parallel
    // This is expecting the original numerical ID format for both
    const [americanData, indianData] = await Promise.all([
        fetchJsonData(`${VOICE_VISEME_PATH}American_viseme.json`),
        fetchJsonData(`${VOICE_VISEME_PATH}Indian_viseme.json`)
    ]);
    americanVisemeData = americanData;
    indianVisemeData = indianData;

    console.log('American viseme data loaded:', americanVisemeData.length, 'entries');
    console.log('Indian viseme data loaded:', indianVisemeData.length, 'entries');


    // Display the idle mouth shape after all assets are loaded
    displayMouthShape(IDLE_VISEME_ID);
    hideLoading(); 

    console.log('App initialized. Ready to select speaker.');
});

// Clean up animation frame if user navigates away
window.addEventListener('beforeunload', () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
});
