
// ======================================
// MEETMIND AI - MAIN JAVASCRIPT
// ======================================

let users = JSON.parse(localStorage.getItem("mm_users") || "[]");
let meetings = JSON.parse(localStorage.getItem("mm_meetings") || "[]");
let currentUser = localStorage.getItem("mm_currentUser");

let recognition = null;
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingSeconds = 0;
let timerInterval = null;
let paused = false;
let selectedFile = null;

// ======================================
// AUTHENTICATION
// ======================================

function showAuth(mode) {
    const login = mode === "login";

    document.getElementById("loginTab").classList.toggle("selected", login);
    document.getElementById("signupTab").classList.toggle("selected", !login);

    document.getElementById("authHeading").textContent =
        login ? "Welcome Back!" : "Create Your Account";

    document.getElementById("authDescription").textContent =
        login ? "Login to your workspace." : "Start your meeting intelligence journey.";

    document.getElementById("authButton").textContent =
        login ? "Login →" : "Create Account →";

    document.getElementById("confirmBox").classList.toggle("hidden", login);

    document.getElementById("authError").textContent = "";
}

async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    const hash = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(hash))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function createSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

document.getElementById("authForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const name = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirmPassword").value;

    const signup = !document.getElementById("confirmBox").classList.contains("hidden");

    const error = document.getElementById("authError");
    error.textContent = "";

    if (name.length < 2) {
        error.textContent = "Please enter a valid name.";
        return;
    }

    if (password.length < 6) {
        error.textContent = "Password must contain at least 6 characters.";
        return;
    }

    if (signup) {
        if (password !== confirm) {
            error.textContent = "Passwords do not match.";
            return;
        }

        if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
            error.textContent = "Account already exists. Please login.";
            return;
        }

        const salt = createSalt();
        const passwordHash = await hashPassword(password, salt);

        users.push({
            id: Date.now().toString(),
            name,
            salt,
            passwordHash
        });

        localStorage.setItem("mm_users", JSON.stringify(users));

    } else {
        const user = users.find(u =>
            u.name.toLowerCase() === name.toLowerCase()
        );

        if (!user) {
            error.textContent = "Account not found. Please sign up.";
            return;
        }

        const enteredHash = await hashPassword(password, user.salt);

        if (enteredHash !== user.passwordHash) {
            error.textContent = "Incorrect password.";
            return;
        }
    }

    currentUser = name;
    localStorage.setItem("mm_currentUser", name);

    openDashboard();
});

// ======================================
// DASHBOARD
// ======================================

function openDashboard() {
    document.getElementById("authPage").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    document.getElementById("profileName").textContent = currentUser;
    document.getElementById("welcomeName").textContent = currentUser.split(" ")[0];
    document.getElementById("avatar").textContent = currentUser[0].toUpperCase();

    loadMeetings();
}

function logout() {
    stopRecording(false);

    currentUser = null;
    localStorage.removeItem("mm_currentUser");

    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("authPage").classList.remove("hidden");

    document.getElementById("authForm").reset();
    showAuth("login");
}

function showPage(page, button) {
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
    });

    document.getElementById(page).classList.add("active");

    document.querySelectorAll(".nav").forEach(n => {
        n.classList.remove("active");
    });

    if (button) button.classList.add("active");

    document.getElementById("pageName").textContent =
        page.charAt(0).toUpperCase() + page.slice(1);

    document.querySelector(".sidebar").classList.remove("open");

    if (page === "meetings") loadMeetings();
    if (page === "tasks") loadTasks();
    if (page === "home") updateDashboard();
}

function toggleSidebar() {
    document.querySelector(".sidebar").classList.toggle("open");
}

// ======================================
// TOAST
// ======================================

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => toast.classList.remove("show"), 3000);
}

// ======================================
// MEETING SUMMARY ENGINE
// ======================================

function generateSummary(text) {
    const sentences = text
        .replace(/\s+/g, " ")
        .match(/[^.!?]+[.!?]?/g) || [];

    const clean = sentences
        .map(s => s.trim())
        .filter(s => s.length > 15);

    const decisions = clean.filter(s =>
        /\b(decided|decision|agreed|approved|confirmed)\b/i.test(s)
    );

    const actions = clean.filter(s =>
        /\b(will|must|should|deadline|task|action|responsible|assign|complete|deliver|submit|finish)\b/i.test(s)
    );

    return {
        overview: clean.slice(0, 3).join(" ") || text.slice(0, 400),
        keyPoints: clean.slice(0, 8),
        decisions: decisions.slice(0, 8),
        actions: actions.slice(0, 10)
    };
}

// ======================================
// SAVE MEETING
// ======================================

function saveMeeting() {
    const transcript = document.getElementById("transcript").value.trim();

    if (!transcript) {
        showToast("Please record or enter some transcript first.");
        return;
    }

    const title = prompt("Enter meeting title:");

    if (title === null) return;

    const summary = generateSummary(transcript);

    const meeting = {
        id: Date.now(),
        user: currentUser,
        title: title.trim() || "Untitled Meeting",
        transcript,
        summary,
        duration: recordingSeconds,
        date: new Date().toLocaleString()
    };

    meetings.push(meeting);

    localStorage.setItem("mm_meetings", JSON.stringify(meetings));

    document.getElementById("transcript").value = "";
    document.getElementById("wordCount").textContent = "0 words";

    recordingSeconds = 0;
    document.getElementById("timer").textContent = "00:00";

    loadMeetings();

    showToast("Meeting summary generated!");

    showMeetingDetail(meeting.id);
}

// ======================================
// LOAD MEETINGS
// ======================================

function getMyMeetings() {
    return meetings.filter(m => m.user === currentUser);
}

function loadMeetings() {
    const myMeetings = getMyMeetings();

    const containers = [
        document.getElementById("allMeetings"),
        document.getElementById("recentMeetings")
    ];

    containers.forEach((container, index) => {
        const list = index === 1 ? myMeetings.slice(-4).reverse() : myMeetings.slice().reverse();

        if (!list.length) {
            container.innerHTML = `
                <div class="empty">
                    <h3>No meetings yet</h3>
                    <p>Your saved meetings will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(m => `
            <div class="meeting-row" onclick="showMeetingDetail(${m.id})">
                <div class="meeting-symbol">◷</div>
                <div>
                    <h3>${escapeHTML(m.title)}</h3>
                    <p>${escapeHTML(m.date)}</p>
                </div>
                <span>${m.summary.actions.length} Tasks →</span>
            </div>
        `).join("");
    });

    updateDashboard();
}

function updateDashboard() {
    const myMeetings = getMyMeetings();

    const words = myMeetings.reduce((total, m) =>
        total + m.transcript.split(/\s+/).filter(Boolean).length, 0
    );

    const tasks = myMeetings.reduce((total, m) =>
        total + m.summary.actions.length, 0
    );

    const seconds = myMeetings.reduce((total, m) =>
        total + (m.duration || 0), 0
    );

    document.getElementById("totalMeetings").textContent = myMeetings.length;
    document.getElementById("totalWords").textContent = words;
    document.getElementById("totalTasks").textContent = tasks;
    document.getElementById("totalHours").textContent =
        (seconds / 3600).toFixed(1);
}

function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// ======================================
// MEETING DETAILS
// ======================================

function showMeetingDetail(id) {
    const meeting = meetings.find(m =>
        m.id === id && m.user === currentUser
    );

    if (!meeting) return;

    const s = meeting.summary;

    document.getElementById("meetingDetail").innerHTML = `
        <h1>${escapeHTML(meeting.title)}</h1>
        <p style="color:#929db6;margin:10px 0 20px">
            ${escapeHTML(meeting.date)}
        </p>

        <div class="detail-box">
            <h3>🧠 Meeting Overview</h3>
            <p>${escapeHTML(s.overview)}</p>
        </div>

        <div class="detail-box">
            <h3>📌 Key Discussion Points</h3>
            ${createList(s.keyPoints)}
        </div>

        <div class="detail-box">
            <h3>🎯 Decisions Taken</h3>
            ${createList(s.decisions)}
        </div>

        <div class="detail-box">
            <h3>⚡ Action Items</h3>
            ${createList(s.actions)}
        </div>

        <div class="detail-box">
            <h3>📝 Full Transcript</h3>
            <p>${escapeHTML(meeting.transcript)}</p>
        </div>

        <button class="primary" onclick="deleteMeeting(${meeting.id})">
            Delete Meeting
        </button>
    `;

    showPage("detail");
}

function createList(items) {
    if (!items.length) return "<p>No information detected.</p>";

    return "<ul>" + items.map(item =>
        `<li>${escapeHTML(item)}</li>`
    ).join("") + "</ul>";
}

function deleteMeeting(id) {
    if (!confirm("Delete this meeting permanently?")) return;

    meetings = meetings.filter(m =>
        !(m.id === id && m.user === currentUser)
    );

    localStorage.setItem("mm_meetings", JSON.stringify(meetings));

    loadMeetings();
    showPage("meetings");

    showToast("Meeting deleted.");
}

// ======================================
// LIVE AUDIO RECORDING
// ======================================

async function startRecording() {
    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        recordingChunks = [];

        mediaRecorder = new MediaRecorder(recordingStream);

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordingChunks.push(event.data);
            }
        };

        mediaRecorder.start();

        paused = false;

        startTimer();
        startSpeechRecognition();

        document.getElementById("startBtn").classList.add("hidden");
        document.getElementById("pauseBtn").classList.remove("hidden");
        document.getElementById("stopBtn").classList.remove("hidden");

        document.getElementById("recordStatus").textContent = "● RECORDING";
        document.getElementById("recordTitle").textContent = "Recording in progress...";
        document.getElementById("wave").classList.add("active");

        showToast("Recording started.");

    } catch (error) {
        showToast("Microphone permission required. Use localhost or HTTPS.");
    }
}

// SPEECH TO TEXT

function startSpeechRecognition() {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        showToast("Speech recognition is not supported in this browser.");
        return;
    }

    recognition = new SpeechRecognition();

    recognition.lang = document.getElementById("language").value;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = event => {
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript + " ";
            }
        }

        if (finalText) {
            const textarea = document.getElementById("transcript");
            textarea.value += finalText;
            updateWordCount();
        }
    };

    recognition.onerror = event => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
            console.warn("Speech recognition:", event.error);
        }
    };

    recognition.onend = () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            try {
                recognition.start();
            } catch (e) {}
        }
    };

    try {
        recognition.start();
    } catch (e) {}
}

// TIMER

function startTimer() {
    clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        if (!paused) {
            recordingSeconds++;

            const min = Math.floor(recordingSeconds / 60);
            const sec = recordingSeconds % 60;

            document.getElementById("timer").textContent =
                String(min).padStart(2, "0") + ":" +
                String(sec).padStart(2, "0");
        }
    }, 1000);
}

// PAUSE / RESUME

function pauseRecording() {
    if (!mediaRecorder) return;

    if (!paused) {
        mediaRecorder.pause();

        try {
            recognition?.stop();
        } catch (e) {}

        paused = true;

        document.getElementById("pauseBtn").textContent = "Resume";
        document.getElementById("recordStatus").textContent = "PAUSED";

        document.getElementById("wave").classList.remove("active");

    } else {
        mediaRecorder.resume();
        paused = false;

        try {
            recognition?.start();
        } catch (e) {}

        document.getElementById("pauseBtn").textContent = "Pause";
        document.getElementById("recordStatus").textContent = "● RECORDING";

        document.getElementById("wave").classList.add("active");
    }
}

// STOP RECORDING

function stopRecording(showMessage = true) {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }

    try {
        recognition?.stop();
    } catch (e) {}

    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }

    clearInterval(timerInterval);

    paused = false;

    document.getElementById("startBtn").classList.remove("hidden");
    document.getElementById("pauseBtn").classList.add("hidden");
    document.getElementById("stopBtn").classList.add("hidden");

    document.getElementById("recordStatus").textContent = "● RECORDING STOPPED";
    document.getElementById("recordTitle").textContent = "Recording completed.";
    document.getElementById("wave").classList.remove("active");

    if (showMessage) {
        showToast("Recording stopped. Save your transcript.");
    }
}

// WORD COUNTER

function updateWordCount() {
    const text = document.getElementById("transcript").value.trim();

    const count = text ? text.split(/\s+/).length : 0;

    document.getElementById("wordCount").textContent =
        count + " words";
}

document.getElementById("transcript").addEventListener("input", updateWordCount);

function clearTranscript() {
    document.getElementById("transcript").value = "";
    updateWordCount();
}

// ======================================
// AUDIO / VIDEO UPLOAD
// ======================================

document.getElementById("mediaFile").addEventListener("change", function() {
    selectedFile = this.files[0];

    if (!selectedFile) return;

    if (selectedFile.size > 80 * 1024 * 1024) {
        showToast("Maximum file size is 80 MB.");
        this.value = "";
        selectedFile = null;
        return;
    }

    document.getElementById("fileName").textContent =
        selectedFile.name + " (" +
        (selectedFile.size / 1024 / 1024).toFixed(2) + " MB)";
});

document.getElementById("dropArea").addEventListener("dragover", e => {
    e.preventDefault();
});

document.getElementById("dropArea").addEventListener("drop", e => {
    e.preventDefault();

    const file = e.dataTransfer.files[0];

    if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
        selectedFile = file;
        document.getElementById("fileName").textContent = file.name;
    } else {
        showToast("Please select an audio or video file.");
    }
});

function processUpload() {
    if (!selectedFile) {
        showToast("Please select a file.");
        return;
    }

    const transcript = document.getElementById("uploadTranscript").value.trim();

    if (!transcript) {
        showToast("Paste a transcript to generate meeting notes. Media transcription is not built into this demo.");
        return;
    }

    const summary = generateSummary(transcript);

    const meeting = {
        id: Date.now(),
        user: currentUser,
        title: selectedFile.name,
        transcript,
        summary,
        duration: 0,
        date: new Date().toLocaleString()
    };

    meetings.push(meeting);

    localStorage.setItem("mm_meetings", JSON.stringify(meetings));

    document.getElementById("uploadMessage").textContent =
        "Meeting summary created successfully!";

    document.getElementById("uploadTranscript").value = "";
    document.getElementById("mediaFile").value = "";
    document.getElementById("fileName").textContent =
        "MP3, WAV, M4A, MP4, WEBM";

    selectedFile = null;

    loadMeetings();
    showToast("Meeting notes generated!");
    showMeetingDetail(meeting.id);
}

// ======================================
// ACTION ITEMS
// ======================================

function loadTasks() {
    const tasks = getMyMeetings().flatMap(meeting =>
        meeting.summary.actions.map(action => ({
            action,
            title: meeting.title
        }))
    );

    const container = document.getElementById("taskList");

    if (!tasks.length) {
        container.innerHTML = `
            <div class="empty">
                <h3>No action items yet</h3>
                <p>Save a meeting containing next steps.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <label class="task-item">
            <input type="checkbox">
            <span>
                ${escapeHTML(task.action)}
                <small>${escapeHTML(task.title)}</small>
            </span>
        </label>
    `).join("");
}

// ======================================
// MEETMIND COPILOT
// ======================================

function addChatMessage(message, type) {
    const container = document.getElementById("chatMessages");

    const div = document.createElement("div");
    div.className = "message " + type;

    const heading = document.createElement("b");
    heading.textContent = type === "user" ? "You" : "MeetMind AI";

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    div.append(heading, paragraph);
    container.appendChild(div);

    container.scrollTop = container.scrollHeight;
}

function searchMeetings(question) {
    const myMeetings = getMyMeetings();

    if (!myMeetings.length) {
        return "You don't have any saved meetings yet. Start recording a meeting first!";
    }

    const q = question.toLowerCase();

    let results = [];

    myMeetings.forEach(meeting => {
        const sentences =
            meeting.transcript.match(/[^.!?]+[.!?]?/g) || [];

        sentences.forEach(sentence => {
            let score = 0;

            q.split(/\W+/).filter(word => word.length > 2).forEach(word => {
                if (sentence.toLowerCase().includes(word)) score++;
            });

            if (score > 0) {
                results.push({
                    sentence,
                    title: meeting.title,
                    score
                });
            }
        });
    });

    if (/decision|decided|agreed|approved/i.test(q)) {
        results = [];

        myMeetings.forEach(m => {
            m.summary.decisions.forEach(sentence => {
                results.push({
                    sentence,
                    title: m.title,
                    score: 10
                });
            });
        });
    }

    if (/action|task|next step|deadline|responsible/i.test(q)) {
        results = [];

        myMeetings.forEach(m => {
            m.summary.actions.forEach(sentence => {
                results.push({
                    sentence,
                    title: m.title,
                    score: 10
                });
            });
        });
    }

    results.sort((a, b) => b.score - a.score);

    if (!results.length) {
        return "I couldn't find matching information in your saved transcripts. Try different keywords.";
    }

    return "Here is what I found in your meeting memory:\n\n" +
        results.slice(0, 7).map((r, i) =>
            `${i + 1}. ${r.sentence}\nMeeting: ${r.title}`
        ).join("\n\n");
}

document.getElementById("chatForm").addEventListener("submit", function(e) {
    e.preventDefault();

    const input = document.getElementById("chatInput");
    const question = input.value.trim();

    if (!question) return;

    addChatMessage(question, "user");

    input.value = "";

    setTimeout(() => {
        const answer = searchMeetings(question);
        addChatMessage(answer, "assistant");
    }, 300);
});

// ======================================
// INITIALIZE APPLICATION
// ======================================

if (currentUser && users.some(u => u.name === currentUser)) {
    openDashboard();
}