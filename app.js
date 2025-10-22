// Pitch Detector using Autocorrelation
class PitchDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.mediaStream = null;
        this.bufferLength = 2048;
        this.buffer = new Float32Array(this.bufferLength);
        this.isListening = false;
        this.onPitchDetected = null;
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.A4 = 440;
    }

    async initialize() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                } 
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.bufferLength * 2;
            this.analyser.smoothingTimeConstant = 0.8;
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            source.connect(this.analyser);
            
            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            return false;
        }
    }

    startListening(callback) {
        if (!this.analyser) {
            console.error('Audio not initialized');
            return;
        }
        
        this.isListening = true;
        this.onPitchDetected = callback;
        this.detectPitch();
    }

    stopListening() {
        this.isListening = false;
    }

    detectPitch() {
        if (!this.isListening) return;

        this.analyser.getFloatTimeDomainData(this.buffer);
        
        const pitch = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);
        
        if (pitch && pitch > 50 && pitch < 2000) {
            const note = this.frequencyToNote(pitch);
            if (this.onPitchDetected) {
                this.onPitchDetected(note);
            }
        }

        requestAnimationFrame(() => this.detectPitch());
    }

    autoCorrelate(buffer, sampleRate) {
        let size = buffer.length;
        let maxSamples = Math.floor(size / 2);
        let bestOffset = -1;
        let bestCorrelation = 0;
        let rms = 0;
        
        for (let i = 0; i < size; i++) {
            let val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        
        if (rms < 0.01) return -1;

        let lastCorrelation = 1;
        for (let offset = 1; offset < maxSamples; offset++) {
            let correlation = 0;

            for (let i = 0; i < maxSamples; i++) {
                correlation += Math.abs(buffer[i] - buffer[i + offset]);
            }
            
            correlation = 1 - (correlation / maxSamples);
            
            if (correlation > 0.9 && correlation > lastCorrelation) {
                let foundGoodCorrelation = false;
                
                if (correlation > bestCorrelation) {
                    bestCorrelation = correlation;
                    bestOffset = offset;
                    foundGoodCorrelation = true;
                }
                
                if (foundGoodCorrelation) {
                    let shift = (buffer[bestOffset + 1] - buffer[bestOffset - 1]) / 
                               (2 * (2 * buffer[bestOffset] - buffer[bestOffset - 1] - buffer[bestOffset + 1]));
                    return sampleRate / (bestOffset + shift);
                }
            }
            
            lastCorrelation = correlation;
        }
        
        if (bestCorrelation > 0.01) {
            return sampleRate / bestOffset;
        }
        
        return -1;
    }

    frequencyToNote(frequency) {
        const noteNum = 12 * (Math.log(frequency / this.A4) / Math.log(2)) + 69;
        const roundedNoteNum = Math.round(noteNum);
        const cents = Math.round((noteNum - roundedNoteNum) * 100);
        const noteName = this.noteNames[roundedNoteNum % 12];
        const octave = Math.floor(roundedNoteNum / 12) - 1;
        
        return {
            frequency: frequency,
            note: noteName,
            octave: octave,
            cents: cents,
            midiNote: roundedNoteNum,
            fullNote: `${noteName}${octave}`
        };
    }

    stop() {
        this.isListening = false;
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Main Application - Scale Degree Trainer
class IntervalTrainerApp {
    constructor() {
        this.pitchDetector = new PitchDetector();
        this.currentQuiz = 0;
        this.totalQuizzes = 30;
        this.correctAnswers = 0;
        this.wrongAnswers = 0;
        this.selectedScale = null;
        this.currentQuestion = null;
        this.isWaitingForAnswer = false;
        this.detectedNotes = [];
        this.noteDetectionTimeout = null;
        
        // Scale degrees
        this.degrees = {
            'I': { index: 0, name: 'I (Tonica)' },
            'II': { index: 1, name: 'II (Sopratonica)' },
            'III': { index: 2, name: 'III (Mediante)' },
            'IV': { index: 3, name: 'IV (Sottodominante)' },
            'V': { index: 4, name: 'V (Dominante)' },
            'VI': { index: 5, name: 'VI (Sopradominante)' },
            'VII': { index: 6, name: 'VII (Sensibile)' }
        };
        
        this.scales = {
            'C': { notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], tonic: 'C', display: 'Do' },
            'G': { notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'], tonic: 'G', display: 'Sol' },
            'D': { notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'], tonic: 'D', display: 'Re' },
            'A': { notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'], tonic: 'A', display: 'La' },
            'E': { notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'], tonic: 'E', display: 'Mi' },
            'B': { notes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'], tonic: 'B', display: 'Si' },
            'F#': { notes: ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'], tonic: 'F#', display: 'Fa#' },
            'Db': { notes: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'], tonic: 'Db', display: 'Reb' },
            'Ab': { notes: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'], tonic: 'Ab', display: 'Lab' },
            'Eb': { notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'], tonic: 'Eb', display: 'Mib' },
            'Bb': { notes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'], tonic: 'Bb', display: 'Sib' },
            'F': { notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'], tonic: 'F', display: 'Fa' }
        };
        
        this.initializeUI();
    }

    initializeUI() {
        this.screens = {
            setup: document.getElementById('setupScreen'),
            quiz: document.getElementById('quizScreen'),
            results: document.getElementById('resultsScreen'),
            permission: document.getElementById('permissionScreen')
        };

        document.getElementById('startBtn').addEventListener('click', () => this.startSession());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopSession());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('requestMicBtn').addEventListener('click', () => this.requestMicrophone());
        
        this.checkMicrophonePermission();
    }

    async checkMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.showScreen('setup');
        } catch (error) {
            this.showScreen('permission');
        }
    }

    async requestMicrophone() {
        const initialized = await this.pitchDetector.initialize();
        if (initialized) {
            this.pitchDetector.stop();
            this.showScreen('setup');
        } else {
            alert('Impossibile accedere al microfono. Controlla le impostazioni del browser.');
        }
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => screen.classList.remove('active'));
        this.screens[screenName].classList.add('active');
    }

    async startSession() {
        const scaleSelect = document.getElementById('scaleSelect');
        const scaleValue = scaleSelect.value;
        
        if (scaleValue === 'random') {
            const scaleKeys = Object.keys(this.scales);
            const randomKey = scaleKeys[Math.floor(Math.random() * scaleKeys.length)];
            this.selectedScale = randomKey;
        } else {
            this.selectedScale = scaleValue;
        }

        const initialized = await this.pitchDetector.initialize();
        if (!initialized) {
            alert('Impossibile accedere al microfono. Ricarica la pagina e riprova.');
            return;
        }

        this.currentQuiz = 0;
        this.correctAnswers = 0;
        this.wrongAnswers = 0;

        document.getElementById('currentScale').textContent = this.scales[this.selectedScale].display + ' Maggiore';
        
        this.showScreen('quiz');
        this.nextQuestion();
    }

    nextQuestion() {
        this.currentQuiz++;
        
        if (this.currentQuiz > this.totalQuizzes) {
            this.showResults();
            return;
        }

        document.getElementById('quizCounter').textContent = `${this.currentQuiz}/${this.totalQuizzes}`;
        document.getElementById('progressFill').style.width = `${(this.currentQuiz / this.totalQuizzes) * 100}%`;

        document.getElementById('correctCount').textContent = this.correctAnswers;
        document.getElementById('wrongCount').textContent = this.wrongAnswers;

        this.currentQuestion = this.generateQuestion();
        
        // Update UI to show scale degree instead of interval
        document.getElementById('baseNote').textContent = this.scales[this.selectedScale].display + ' Maggiore';
        document.getElementById('targetInterval').textContent = this.currentQuestion.degreeName;
        
        document.getElementById('feedbackArea').classList.add('hidden');
        document.getElementById('questionArea').style.display = 'block';
        
        this.startListening();
    }

    generateQuestion() {
        const scale = this.scales[this.selectedScale];
        
        // Select random scale degree (0-6 for I-VII)
        const degreeIndex = Math.floor(Math.random() * 7);
        const degreeKeys = Object.keys(this.degrees);
        const degreeKey = degreeKeys[degreeIndex];
        const degree = this.degrees[degreeKey];
        
        const targetNote = scale.notes[degree.index];
        
        return {
            scaleName: scale.display + ' Maggiore',
            degreeNumber: degreeKey,
            degreeName: degree.name,
            targetNote: this.normalizeNote(targetNote),
            targetNoteDisplay: this.displayNote(targetNote)
        };
    }

    normalizeNote(note) {
        const flatsToSharps = {
            'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'E#': 'F'
        };
        return flatsToSharps[note] || note;
    }

    displayNote(note) {
        const noteMap = {
            'C': 'Do', 'C#': 'Do#', 'Db': 'Reb',
            'D': 'Re', 'D#': 'Re#', 'Eb': 'Mib',
            'E': 'Mi', 'E#': 'Fa',
            'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Solb',
            'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Lab',
            'A': 'La', 'A#': 'La#', 'Bb': 'Sib',
            'B': 'Si', 'B#': 'Do'
        };
        return noteMap[note] || note;
    }

    startListening() {
        this.isWaitingForAnswer = true;
        this.detectedNotes = [];
        
        document.getElementById('listeningIndicator').classList.remove('hidden');
        
        this.pitchDetector.startListening((noteData) => {
            if (!this.isWaitingForAnswer) return;
            
            this.detectedNotes.push(noteData.note);
            
            if (this.noteDetectionTimeout) {
                clearTimeout(this.noteDetectionTimeout);
            }
            
            this.noteDetectionTimeout = setTimeout(() => {
                this.evaluateAnswer();
            }, 500);
        });
    }

    evaluateAnswer() {
        if (!this.isWaitingForAnswer || this.detectedNotes.length === 0) return;
        
        this.isWaitingForAnswer = false;
        this.pitchDetector.stopListening();
        document.getElementById('listeningIndicator').classList.add('hidden');
        
        const detectedNote = this.getMostCommonNote(this.detectedNotes);
        const normalizedDetected = this.normalizeNote(detectedNote);
        const normalizedTarget = this.normalizeNote(this.currentQuestion.targetNote);
        
        const isCorrect = normalizedDetected === normalizedTarget;
        
        this.showFeedback(isCorrect, detectedNote);
        
        if (isCorrect) {
            this.correctAnswers++;
            setTimeout(() => this.nextQuestion(), 1000);
        } else {
            this.wrongAnswers++;
            setTimeout(() => this.nextQuestion(), 3000);
        }
    }

    getMostCommonNote(notes) {
        if (notes.length === 0) return null;
        
        const counts = {};
        notes.forEach(note => {
            counts[note] = (counts[note] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostCommon = notes[0];
        
        Object.keys(counts).forEach(note => {
            if (counts[note] > maxCount) {
                maxCount = counts[note];
                mostCommon = note;
            }
        });
        
        return mostCommon;
    }

    showFeedback(isCorrect, detectedNote) {
        const feedbackArea = document.getElementById('feedbackArea');
        const feedbackIcon = document.getElementById('feedbackIcon');
        const feedbackText = document.getElementById('feedbackText');
        
        document.getElementById('questionArea').style.display = 'none';
        feedbackArea.classList.remove('hidden', 'correct', 'wrong');
        
        if (isCorrect) {
            feedbackArea.classList.add('correct');
            feedbackIcon.textContent = '✓';
            feedbackText.innerHTML = `
                <div>Corretto!</div>
                <div class="feedback-detail">Hai suonato: ${this.displayNote(detectedNote)}</div>
            `;
        } else {
            feedbackArea.classList.add('wrong');
            feedbackIcon.textContent = '✗';
            feedbackText.innerHTML = `
                <div>Sbagliato!</div>
                <div class="feedback-detail">Hai suonato: ${this.displayNote(detectedNote)}</div>
                <div class="feedback-detail">Il ${this.currentQuestion.degreeName} di ${this.currentQuestion.scaleName} è: ${this.currentQuestion.targetNoteDisplay}</div>
            `;
        }
    }

    stopSession() {
        this.pitchDetector.stop();
        this.showResults();
    }

    showResults() {
        this.pitchDetector.stop();
        
        const accuracy = this.totalQuizzes > 0 
            ? Math.round((this.correctAnswers / this.totalQuizzes) * 100) 
            : 0;
        
        document.getElementById('finalCorrect').textContent = this.correctAnswers;
        document.getElementById('finalWrong').textContent = this.wrongAnswers;
        document.getElementById('finalAccuracy').textContent = accuracy + '%';
        
        this.showScreen('results');
    }

    reset() {
        this.pitchDetector.stop();
        this.currentQuiz = 0;
        this.correctAnswers = 0;
        this.wrongAnswers = 0;
        this.showScreen('setup');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new IntervalTrainerApp();
});