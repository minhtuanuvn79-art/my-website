const { createApp, ref, computed, onMounted, watch } = Vue;

const supabaseUrl = 'https://dtfdzuggnitsdnlutryn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmR6dWdnbml0c2RubHV0cnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mjk0NTAsImV4cCI6MjA5MDUwNTQ1MH0.9Ne1ONIO9-ASkThtFZJLxV42dbyIMGkHwweIjTZ5A6Q';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
let studentChannel = null;
let teacherChannel = null;

// Danh sách tài khoản mặc định
const FIXED_ACCOUNTS = [
    { id: 1, name: 'admin', password: '123', role: 'admin' },
    { id: 2, name: 'teacher', password: '123', role: 'teacher' }
];
createApp({
    setup() {
        // Lấy lại trang và tab cũ từ bộ nhớ trình duyệt (nếu có)
const savedView = localStorage.getItem('eduexam_current_view') || 'login';
const savedTab = localStorage.getItem('eduexam_teacher_tab') || 'exams';

const view = ref(savedView);
const teacherTab = ref(savedTab);
        const currentTime = ref(new Date());
        // --- 1. KHAI BÁO TẤT CẢ BIẾN STATE TRƯỚC ---
        const savedUser = localStorage.getItem('eduexam_user');
        const currentUser = ref(savedUser ? JSON.parse(savedUser) : null);
        // 2. Cập nhật Watcher để lưu đúng tên khóa
watch(view, (newView) => {
    localStorage.setItem('eduexam_current_view', newView);
});

watch(teacherTab, (newTab) => {
    localStorage.setItem('eduexam_teacher_tab', newTab);
});
        
        const currentExam = ref(null);
        const currentSlide = ref(0);
        const newExam = ref({ title: '', questions: [], settings: {} });
        
        const notification = ref({ show: false, message: '', type: 'success' });
        const authForm = ref({ name: '', password: '' });
        const users = ref([]);
        const exams = ref([]);
        const allResults = ref([]);
        const searchUser = ref('');
        
        // Các biến hỗ trợ khác
        const isFullscreen = ref(false);
        const cheatWarnings = ref(0);
        const timeLeft = ref(0);
        const timerInterval = ref(null);
        const studentAnswers = ref([]);
        const finalResult = ref({ score: 0, correct: 0 });
        
        // AI & UI State
        const isGenerating = ref(false);
        const aiPrompt = ref('');
        const aiMatrix = ref({ mc: true, tf: true, sa: true });
        const aiUploadedImage = ref(null);
        const aiUploadedFileName = ref('');
        const aiImageBase64 = ref('');
        const showSettingsModal = ref(false);
        const showSlideAnswer = ref(false);
        const activeQuestionTab = ref('mc'); // Tab mặc định khi soạn đề là Trắc nghiệm

const sessionId = ref(Math.random().toString(36).substring(2, 10)); // ID phiên làm việc
const monitoringExamId = ref('');    // ID đề thi đang được giám sát
const isMonitoring = ref(false);     // Trạng thái mở phòng giám sát
const activeStudents = ref({});      // Danh sách học sinh trong phòng thi 4.0
const studentFile = ref(null);       // File nộp bài tự luận của học sinh
const isAIGradingSubmission = ref(false); // Trạng thái AI đang chấm bài khi nộp\
const defaultSettings = {
    scoreVisibility: 'always',
    answerVisibility: 'always',
    attemptLimit: 0,
    password: '',
    autoMonitor: true,
    shuffleMode: true,
    tfGradingScale: [0, 0.1, 0.25, 0.5, 1.0],
    // --- THUỘC TÍNH MỚI ---
    isPublished: false,
    scheduledAt: null,
    closedAt: null      // Thêm dòng này: Thời điểm đóng đề
};

        // --- 2. SAU ĐÓ MỚI ĐẾN WATCH VÀ HÀM ---
        const renderMath = () => {
            setTimeout(() => {
                if (window.MathJax && window.MathJax.typesetPromise) 
                    window.MathJax.typesetPromise().catch((err) => console.error('MathJax error:', err));
            }, 100); 
        };

        // Bây giờ watch sẽ hoạt động vì 'view' đã tồn tại
        watch([view, currentExam, currentSlide, newExam], () => renderMath(), { deep: true });

        // ... các hàm showNotify, handleLogin, v.v. viết tiếp ở dưới

        const gradingModal = ref(false);
        const currentGradingResult = ref(null);
        const manualScore = ref(0);
        const questionScores = ref([]); 
        const joinCode = ref('');
        const showQrModal = ref(false);
        const currentQrCode = ref('');
        const currentQrExamTitle = ref('');

        // ==========================================
        // HÀM HỆ THỐNG VÀ XỬ LÝ CHUNG
        // ==========================================
        const showNotify = (msg, type = 'success') => {
            notification.value = { show: true, message: msg, type: type };
            setTimeout(() => { notification.value.show = false; }, 3000);
        };

        const shuffleArray = (array) => {
            let currentIndex = array.length, randomIndex;
            while (currentIndex !== 0) {
                randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
            }
            return array;
        };

        // app.js

const handleVisibilityChange = () => {
    if (view.value === 'exam-room' && document.hidden) {
        // Nếu giáo viên tắt tính năng giám sát thì bỏ qua
        if(currentExam.value?.settings?.autoMonitor === false) return; 
        
        cheatWarnings.value++;
        
        // Gửi cập nhật vi phạm về máy giáo viên qua Realtime
        sendRealtimeUpdate('Cảnh báo gian lận!'); 
        
        if (cheatWarnings.value >= 3) {
            // Đã vi phạm đủ 3 lần: Thông báo nhanh và nộp bài ngay
            showNotify("Bạn đã vi phạm quy chế thi 3 lần. Hệ thống tự động thu bài!", "error");
            
            // Dừng bộ đếm thời gian tránh nộp bài chồng chéo
            if (timerInterval.value) clearInterval(timerInterval.value);
            
            // Gọi hàm nộp bài trực tiếp
            submitExam(); 
        } else {
            showNotify(`CẢNH BÁO: Bạn đã rời khỏi màn hình thi ${cheatWarnings.value}/3 lần!`, 'error');
        }
    }
};

        const handleFullscreenChange = () => {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            isFullscreen.value = isFull; 
            if (view.value === 'exam-room' && !isFull) {
                cheatWarnings.value++;
                showNotify("CẢNH BÁO: Bạn đã thoát chế độ Toàn màn hình!", "error");
                sendRealtimeUpdate('Thoát Toàn màn hình');
                if (cheatWarnings.value >= 5) { alert("Vi phạm quá nhiều lần. Hệ thống tự động nộp bài!"); submitExam(); }
            }
        };

        const enterFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
    }
};

        const setupGlobalAuthPresence = async () => {
            if (!currentUser.value) return;
            const userChannel = supabaseClient.channel(`auth-presence-${currentUser.value.id}`, { config: { presence: { key: currentUser.value.id } } });
            userChannel.on('presence', { event: 'sync' }, () => {
                const state = userChannel.presenceState();
                const sessions = state[currentUser.value.id];
                if (sessions && sessions.length > 1) {
                    const otherSession = sessions.find(s => s.sessionId !== sessionId.value);
                    if (otherSession) showNotify("Tài khoản đang được đăng nhập ở thiết bị khác!", "error");
                }
            }).subscribe(async (status) => {
                if (status === 'SUBSCRIBED') await userChannel.track({ userId: currentUser.value.id, userName: currentUser.value.name, sessionId: sessionId.value, onlineAt: new Date().toISOString() });
            });
        };

        const loadData = async () => {
            const [uRes, eRes, rRes] = await Promise.all([
                supabaseClient.from('users').select('*'), supabaseClient.from('exams').select('*'), supabaseClient.from('results').select('*')
            ]);
            if (uRes.data) users.value = uRes.data;
            if (eRes.data) exams.value = eRes.data;
            if (rRes.data) allResults.value = rRes.data;
            if (!users.value.find(u => u.name === 'admin')) { await supabaseClient.from('users').insert(FIXED_ACCOUNTS); users.value.push(...FIXED_ACCOUNTS); }
        };

        onMounted(() => {
            loadData();
            subscribeToExamChanges(); // PHẢI THÊM DÒNG NÀY VÀO ĐÂY
            document.addEventListener('contextmenu', (e) => { if (view.value === 'exam-room') { e.preventDefault(); showNotify("Hành động bị cấm trong phòng thi!", "error"); } });
            document.addEventListener('keydown', (e) => {
                const isExamActive = view.value === 'exam-room' && (document.fullscreenElement || document.webkitFullscreenElement);
                if (isExamActive) {
                    if (e.ctrlKey && ['c', 'v', 'x', 's', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); showNotify("Phím tắt bị vô hiệu hóa!", "error"); }
                    if (e.key === 'F12') e.preventDefault();
                }
            });
            document.addEventListener('paste', (e) => { if (view.value === 'exam-room') { e.preventDefault(); showNotify("Bạn phải tự nhập câu trả lời, không được dán văn bản!", "error"); } });
            document.addEventListener('visibilitychange', handleVisibilityChange);
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            if (!localStorage.getItem('eduexam_sessionId')) localStorage.setItem('eduexam_sessionId', sessionId.value);
            if (currentUser.value) setupGlobalAuthPresence(); 
        setInterval(() => {
        currentTime.value = new Date();
    }, 1000);
});

        // ==========================================
        // QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN
        // ==========================================
        const switchView = (target) => { authForm.value.name = ''; authForm.value.password = ''; view.value = target; };
        const getRoleName = (role) => role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : 'Học sinh';
        const getRoleBadgeClass = (role) => role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'teacher' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';

        const handleRegister = async () => {
            if (!authForm.value.name.trim() || !authForm.value.password.trim()) return showNotify("Vui lòng điền đầy đủ thông tin", "error");
            if (users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase())) return showNotify("Tên người dùng đã tồn tại", "error");
            const newUser = { id: Date.now(), name: authForm.value.name, password: authForm.value.password, role: 'student' };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            if (!error) { users.value.push(newUser); showNotify("Đăng ký thành công!"); switchView('login'); } else showNotify("Lỗi CSDL: " + error.message, "error");
        };

        const handleLogin = () => {
    if (!authForm.value.name.trim() || !authForm.value.password.trim()) return showNotify("Vui lòng nhập tên và mật khẩu", "error");
    
    const user = users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase());
    if (!user) return showNotify("Tài khoản không tồn tại", "error");
    if (user.password !== authForm.value.password) return showNotify("Mật khẩu không chính xác", "error");

    // Lưu phiên làm việc
    currentUser.value = user;
    localStorage.setItem('eduexam_user', JSON.stringify(user));
    
    // Điều hướng trang dựa trên vai trò
    view.value = user.role === 'admin' ? 'admin-dash' : user.role === 'teacher' ? 'teacher-dash' : 'student-dash';
    if(user.role === 'teacher') teacherTab.value = 'exams';
    
    showNotify(`Chào mừng ${user.name}!`);
};

        const logout = () => {
    if (view.value === 'exam-room' && !confirm("Đang trong phòng thi. Bạn có chắc muốn đăng xuất?")) return;
    
    // Xóa tất cả key của EduExam
    const keys = ['eduexam_user', 'eduexam_current_view', 'eduexam_teacher_tab', 'eduexam_sessionId'];
    keys.forEach(k => localStorage.removeItem(k));
    
    if (studentChannel) supabaseClient.removeChannel(studentChannel);
    if (teacherChannel) supabaseClient.removeChannel(teacherChannel);
    if (timerInterval.value) clearInterval(timerInterval.value);
    
    currentUser.value = null;
    view.value = 'login';
    showNotify("Đã đăng xuất!");
};

        const goHome = () => {
    if (view.value === 'exam-room' && !confirm("Rời khỏi phòng thi? Tiến trình sẽ không được lưu nếu chưa nộp bài.")) return;
    
    // Reset dữ liệu thi để tránh lỗi title khi quay lại dash
    currentExam.value = null; 
    
    if (view.value === 'presentation') exitPresentation();
    if (timerInterval.value) clearInterval(timerInterval.value);
    
    // Sử dụng dấu ? để tránh lỗi khi F5 mà currentUser chưa kịp load
    view.value = currentUser.value?.role === 'admin' ? 'admin-dash' : currentUser.value?.role === 'teacher' ? 'teacher-dash' : 'student-dash';
};

        const filteredUsers = computed(() => searchUser.value ? users.value.filter(u => u.name.toLowerCase().includes(searchUser.value.toLowerCase())) : users.value);
        const openAddModal = () => { newUserData.value = { name: '', password: '', role: 'teacher' }; showAddModal.value = true; };
        const saveNewUser = async () => {
            if (!newUserData.value.name.trim() || !newUserData.value.password.trim()) return showNotify("Nhập đầy đủ thông tin", "error");
            const newUser = { id: Date.now(), ...newUserData.value };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            if (!error) { users.value.push(newUser); showAddModal.value = false; showNotify("Đã tạo người dùng mới."); }
        };
        const deleteUser = async (id) => { 
            if (confirm("Xóa tài khoản này?")) { const { error } = await supabaseClient.from('users').delete().eq('id', id); if (!error) { users.value = users.value.filter(u => u.id !== id); showNotify("Đã xóa tài khoản."); } }
        };
        const updateUserRole = async (user, newRole) => { 
            const { error } = await supabaseClient.from('users').update({ role: newRole }).eq('id', user.id); if (!error) { user.role = newRole; showNotify("Cập nhật quyền thành công."); }
        };
        const openEditModal = (user) => { editUserData.value = { ...user }; showEditModal.value = true; };
        const saveUserEdit = async () => {
            const { error } = await supabaseClient.from('users').update({ name: editUserData.value.name, password: editUserData.value.password, role: editUserData.value.role }).eq('id', editUserData.value.id);
            if (!error) { const idx = users.value.findIndex(u => u.id === editUserData.value.id); if (idx !== -1) users.value[idx] = { ...editUserData.value }; showEditModal.value = false; showNotify("Đã lưu thông tin."); }
        };

        // ==========================================
        // QUẢN LÝ ĐỀ THI, TRÌNH CHIẾU & PHÒNG THI 4.0
        // ==========================================
        const startPresentation = (exam) => {
            if(exam.type !== 'quiz') return showNotify("Chỉ hỗ trợ đề trắc nghiệm/hỗn hợp!", "error");
            currentExam.value = exam; currentSlide.value = 0; showSlideAnswer.value = false; view.value = 'presentation';
        };
        const nextSlide = () => { if (currentSlide.value < currentExam.value.questions.length - 1) { currentSlide.value++; showSlideAnswer.value = false; } };
        const prevSlide = () => { if (currentSlide.value > 0) { currentSlide.value--; showSlideAnswer.value = false; } };
        const exitPresentation = () => { view.value = 'teacher-dash'; teacherTab.value = 'exams'; };

        const startMonitoring = () => {
            if (!monitoringExamId.value) return showNotify("Vui lòng chọn 1 đề thi!", "error");
            isMonitoring.value = true; activeStudents.value = {}; 
            if (teacherChannel) supabaseClient.removeChannel(teacherChannel);
            teacherChannel = supabaseClient.channel('room-' + monitoringExamId.value);
            teacherChannel.on('presence', { event: 'sync' }, () => {
                const state = teacherChannel.presenceState(); let active = {};
                for (let id in state) active[state[id][0].studentName] = state[id][0];
                activeStudents.value = active;
            }).subscribe((status) => { if (status === 'SUBSCRIBED') showNotify("Đã mở Giám sát phòng thi 4.0!"); });
        };

        const sendRealtimeUpdate = async (statusText = 'Đang làm bài') => {
            if (!studentChannel || !currentExam.value) return;
            let answeredCount = 0;
            if (currentExam.value.type === 'quiz') {
                answeredCount = studentAnswers.value.filter((ans, idx) => {
                    const qType = currentExam.value.questions[idx]?.type;
                    if (qType === 'tf') return ans.choice && Array.isArray(ans.choice) && ans.choice.filter(c => c !== null).length === 4;
                    return ans.choice !== null || (ans.text && ans.text.trim() !== '') || ans.fileData !== null;
                }).length;
            } else answeredCount = studentFile.value ? 1 : 0;
            
            await studentChannel.track({ studentName: currentUser.value.name, progress: answeredCount, total: currentExam.value.questions?.length || 1, cheats: cheatWarnings.value, status: statusText, lastUpdate: Date.now() });
        };

       const addQuestion = (type) => {
    const targetType = type || activeQuestionTab.value;
    let options = ['', '', '', ''];
    let correct = 0;
    let points = 0.25;

    if (targetType === 'tf') {
        correct = [true, true, true, true];
        points = 1.0;
    } else if (targetType === 'sa' || targetType === 'essay') {
        options = [];
        correct = null;
        points = 0.5;
    }

    newExam.value.questions.push({
        type: targetType,
        text: '',
        options: options,
        correct: correct,
        explanation: '',
        points: points
    });
    showNotify(`Đã thêm 1 câu vào phần ${targetType.toUpperCase()}`);
};
const removeQuestion = (originalIdx) => {
    if (confirm("Bạn có chắc muốn xóa câu hỏi này?")) {
        newExam.value.questions.splice(originalIdx, 1);
        showNotify("Đã xóa câu hỏi", "error");
    }
};
        const openEditExam = (exam) => { newExam.value = JSON.parse(JSON.stringify(exam)); view.value = 'create-exam'; };
const openCreateNewExam = () => {
    newExam.value = { 
        title: '', 
        type: 'quiz', 
        time: 15, 
        questions: [], 
        essayContent: '', 
        // Tạo bản sao từ defaultSettings để tránh tham chiếu ngược
        settings: { ...defaultSettings },
        // Đảm bảo các thuộc tính hệ thống khác cũng được reset
        examCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    }; 
    
    // Chuyển sang màn hình soạn thảo
    view.value = 'create-exam'; 
    
    // Reset tab soạn thảo về Trắc nghiệm mặc định
    activeQuestionTab.value = 'mc';
    
    showNotify("Đã khởi tạo phôi đề thi mới!");
};
        const saveExam = async () => {
            if (!newExam.value.title) return showNotify("Vui lòng nhập tên đề thi/bài tập", "error");
            if (newExam.value.type === 'quiz' && newExam.value.questions.length === 0) return showNotify("Đề thi cần ít nhất 1 câu hỏi", "error");
            
            const isEditing = !!newExam.value.id;
            if(!newExam.value.settings) newExam.value.settings = {...defaultSettings};
            const examData = { ...newExam.value, creator: currentUser.value.name, examCode: newExam.value.examCode || Math.random().toString(36).substring(2, 8).toUpperCase() };

            let error;
            if (isEditing) error = (await supabaseClient.from('exams').update(examData).eq('id', newExam.value.id)).error;
            else { examData.id = Date.now(); error = (await supabaseClient.from('exams').insert([examData])).error; }
            
            if (!error) {
                if (isEditing) { const idx = exams.value.findIndex(e => e.id === examData.id); if (idx !== -1) exams.value[idx] = examData; showNotify("Đã cập nhật đề thi!"); } 
                else { exams.value.push(examData); showNotify("Đã giao bài thành công! Mã Code: " + examData.examCode); }
                view.value = 'teacher-dash'; teacherTab.value = 'exams';
            } else showNotify("Lỗi lưu đề: " + error.message, "error");
        };

        const deleteExam = async (id) => {
            if(confirm("Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này không?")) {
                await supabaseClient.from('exams').delete().eq('id', id); await supabaseClient.from('results').delete().eq('examId', id);
                exams.value = exams.value.filter(e => e.id !== id); allResults.value = allResults.value.filter(r => r.examId !== id); showNotify("Đã xóa đề thi.");
            }
        };

        const viewResults = (id) => { currentExam.value = exams.value.find(e => e.id === id); view.value = 'view-results'; };
        const filteredResults = computed(() => {
            if (!currentExam.value) return [];
            const resultsForExam = allResults.value.filter(r => r.examId === currentExam.value.id);
            const attemptCounts = {}; resultsForExam.forEach(r => attemptCounts[r.studentName] = (attemptCounts[r.studentName] || 0) + 1);
            return resultsForExam.map(r => ({ ...r, totalAttempts: attemptCounts[r.studentName] }));
        });
            const filteredEditorQuestions = computed(() => {
    if (!newExam.value || !newExam.value.questions) return [];
    // Trả về danh sách câu hỏi kèm theo index gốc để dễ sửa/xóa
    return newExam.value.questions
        .map((q, idx) => ({ ...q, originalIdx: idx }))
        .filter(q => q.type === activeQuestionTab.value);
});
        const handleAiFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Reset trạng thái file cũ
    aiUploadedImage.value = null; 
    aiImageBase64.value = ''; 
    aiUploadedFileName.value = file.name;
    
    const fileExt = file.name.split('.').pop().toLowerCase();
    showNotify("Hệ thống đang tiền xử lý tài liệu...", "success");

    // XỬ LÝ ẢNH (JPG, PNG)
    if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
        const reader = new FileReader();
        reader.onload = (e) => { 
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scale = Math.min(1500 / img.width, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                aiUploadedImage.value = compressedBase64; 
                aiImageBase64.value = compressedBase64.split(',')[1]; 
                showNotify("Đã nén ảnh thành công!"); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } 
    
    // XỬ LÝ PDF (Đọc toàn bộ các trang)
    else if (fileExt === 'pdf') {
        const reader = new FileReader();
        reader.onload = async (e) => { 
            try {
                const typedarray = new Uint8Array(e.target.result);
                if (!window.pdfjsLib) throw new Error("Thư viện PDF chưa sẵn sàng!");
                
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                
                const pdf = await window.pdfjsLib.getDocument(typedarray).promise; 
                let totalHeight = 0;
                let maxWidth = 0;
                const canvases = [];
                
                // Đọc TOÀN BỘ trang thay vì giới hạn 4 trang như trước
                const numPages = pdf.numPages; 
                
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.2 }); 
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    canvases.push(canvas);
                    totalHeight += canvas.height;
                    if (canvas.width > maxWidth) maxWidth = canvas.width;
                }
                
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = maxWidth;
                finalCanvas.height = totalHeight;
                const finalCtx = finalCanvas.getContext('2d');
                finalCtx.fillStyle = "white";
                finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                
                let currentY = 0;
                for (let canvas of canvases) {
                    finalCtx.drawImage(canvas, 0, currentY);
                    currentY += canvas.height;
                }
                
                // Nén JPEG 0.4 để giảm dung lượng khi gửi đề thi nhiều câu
                // Tìm trong handleAiFileUpload đoạn xử lý PDF
// app.js
const base64Img = finalCanvas.toDataURL('image/jpeg', 0.25); // Tăng lên 0.25 để AI nhìn thấy chữ
//                 aiUploadedImage.value = base64Img; 
                aiImageBase64.value = base64Img.split(',')[1]; 
                
                showNotify(`Đã chuẩn bị xong ${numPages} trang PDF!`);
            } catch(err) {
                showNotify("Lỗi xử lý PDF: " + err.message, "error");
            }
        };
        reader.readAsArrayBuffer(file);
    } 
    
    // XỬ LÝ WORD (DOCX)
    else if (fileExt === 'docx') {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (!window.mammoth) return showNotify("Thư viện Word chưa sẵn sàng!", "error");
            mammoth.extractRawText({ arrayBuffer: e.target.result })
            .then(res => { 
                aiPrompt.value = res.value + "\n\n" + aiPrompt.value; 
                showNotify("Đã trích xuất nội dung văn bản từ Word!"); 
            })
            .catch(err => showNotify("Lỗi đọc Word: " + err.message, "error"));
        };
        reader.readAsArrayBuffer(file);
    }
    event.target.value = ''; 
};

        const handleGenerateAI = async () => {
    if (!aiPrompt.value.trim() && !aiImageBase64.value) {
        return showNotify("Vui lòng nhập nội dung hoặc tải file đề!", "error");
    }
    
    isGenerating.value = true;
    // Thông báo cho người dùng về quá trình xử lý bóc tách 3 phần
    showNotify("AI đang phân tích và bóc tách 3 phần: Trắc nghiệm, Đúng/Sai, Tự luận...", "success");
    
    try {
        // Cấu trúc Prompt đặc biệt để ép AI phân loại đúng theo file AZOTA.docx 
        const strictPrompt = `
            Dựa trên nội dung tài liệu này, hãy bóc tách chính xác thành các loại sau:
            1. Các câu có 4 đáp án A,B,C,D: để type là 'mc'. 
            2. Các câu có chùm ý a,b,c,d (Đúng/Sai): để type là 'tf'. Mảng correct phải có 4 giá trị true/false. 
            3. Các câu hỏi yêu cầu giải thích/trình bày (Tự luận): để type là 'sa'. 
            Nội dung bổ sung từ người dùng: ${aiPrompt.value.trim()}
        `;

        const payload = { 
            prompt: strictPrompt, 
            imageBase64: aiImageBase64.value || null,
            matrix: aiMatrix.value // 
        };

        const { data, error } = await supabaseClient.functions.invoke('generate-exam', { 
            body: payload 
        });
        
        if (error) throw error;
        
        let generatedQuestions = [];
        try {
            let aiRawText = typeof data === 'string' ? data : (data.text || JSON.stringify(data));
            const cleanData = aiRawText.replace(/```json/g, '').replace(/```/g, '').trim();
            generatedQuestions = JSON.parse(cleanData);
        } catch (jsonErr) {
            throw new Error("Dữ liệu AI trả về lỗi cấu trúc. Hãy thử lại bằng cách quét ảnh rõ hơn.");
        }

        // --- BỘ LỌC LOGIC SỬA SAI CHO AI ---
        const finalQuestions = (Array.isArray(generatedQuestions) ? generatedQuestions : []).map(q => {
            let finalType = q.type || 'mc';

            // Kiểm tra nếu AI nhầm lẫn: Câu có 4 ý a,b,c,d nhưng lại để 'mc' thì ép về 'tf' (Đúng/Sai) 
            if (q.options && q.options.length === 4 && Array.isArray(q.correct)) {
                finalType = 'tf';
            }

            // Kiểm tra nếu câu hỏi không có phương án lựa chọn thì ép về 'sa' (Tự luận/Trả lời ngắn) 
            if (!q.options || q.options.length === 0 || q.options.every(opt => opt === "")) {
                finalType = 'sa';
            }

            return { 
                type: finalType, 
                text: q.text || "Câu hỏi không có nội dung", 
                options: q.options || (finalType === 'tf' ? ['', '', '', ''] : (finalType === 'mc' ? ['', '', '', ''] : [])), 
                correct: q.correct !== undefined ? q.correct : (finalType === 'tf' ? [true, true, true, true] : 0), 
                explanation: q.explanation || '',
                // Gán điểm mặc định theo chuẩn phân phối điểm thường thấy
                points: finalType === 'tf' ? 1.0 : (finalType === 'sa' ? 0.75 : 0.25) 
            };
        });

        if (finalQuestions.length === 0) {
            throw new Error("Không tìm thấy câu hỏi nào hợp lệ.");
        }

        // Cập nhật vào form tạo đề
        newExam.value = { 
            title: 'Đề thi bóc tách AI - ' + new Date().toLocaleDateString('vi-VN'), 
            type: 'quiz', 
            time: 45, 
            questions: finalQuestions, 
            essayContent: '', 
            settings: { ...defaultSettings } 
        };

        showNotify(`Thành công! Đã bóc tách được ${finalQuestions.length} câu hỏi theo đúng phân loại.`);
        
        // Reset trạng thái sau khi xong
        aiPrompt.value = ''; 
        aiUploadedImage.value = null; 
        aiImageBase64.value = ''; 
        
        // Chuyển sang màn hình soạn thảo đề thi để giáo viên kiểm tra 
        view.value = 'create-exam'; 
        
    } catch (err) { 
        console.error("AI Error:", err);
        showNotify("Lỗi xử lý: " + err.message, "error"); 
    } finally { 
        isGenerating.value = false; 
    }
};

        const exportToWord = (exam) => {
            let content = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>${exam.title}</title><style>body { font-family: 'Times New Roman'; font-size: 14pt; } .title { text-align: center; font-weight: bold; font-size: 16pt; text-transform: uppercase; margin-bottom: 5px;} .time { text-align: center; font-style: italic; margin-bottom: 20px; }</style></head><body><div class='title'>ĐỀ THI: ${exam.title}</div><div class='time'>Thời gian làm bài: ${exam.time} phút</div>`;
            if (exam.type === 'quiz') {
                exam.questions.forEach((q, i) => {
                    content += `<div style="margin-top: 15px;"><b>Câu ${i + 1}:</b> ${q.text}</div>`;
                    if(q.type === 'mc' || q.type === 'tf') q.options.forEach((opt, o) => content += `<div style="margin-left: 15px;">${String.fromCharCode(65 + o)}. ${opt}</div>`);
                    else content += `<div style="height: 80px;"></div>`;
                });
                content += `<br><hr><div class='title' style='margin-top: 20px;'>BẢNG ĐÁP ÁN</div>`;
                exam.questions.forEach((q, i) => { 
                    content += `<div style="margin-bottom: 5px;"><b>Câu ${i + 1}:</b> ${q.type==='mc'?String.fromCharCode(65+q.correct):'Tự luận'}. <br><i>${q.explanation}</i></div>`; 
                });
            } else content += `<div><b>Nội dung đề bài tự luận:</b><br>${exam.essayContent.replace(/\n/g, '<br>')}</div>`;
            content += `</body></html>`;
            const blob = new Blob(['\ufeff', content], { type: 'application/msword' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `De_Thi_${exam.title.replace(/\s/g, '_')}.doc`; link.click();
            showNotify("Đã xuất file Word thành công!");
        };

        // ==========================================
        // QUẢN LÝ CHẤM ĐIỂM (GIÁO VIÊN & AI CHẤM TỰ LUẬN)
        // ==========================================
        const openGradingModal = (result) => { 
            currentGradingResult.value = result; manualScore.value = result.score || 0; 
            const exam = exams.value.find(e => e.id === result.examId);
            if (exam && result.studentAnswersLog) {
                questionScores.value = result.studentAnswersLog.map((ans, i) => {
                    if (ans.score !== undefined) return ans.score; 
                    const q = exam.questions[i]; const p = q.points || 0;
                    if (q.type === 'mc') return (ans.choice === q.correct) ? p : 0;
                    if (q.type === 'tf') { let match = 0; for (let j=0; j<4; j++) if (ans.choice && ans.choice[j]===q.correct[j]) match++; let scale = exam.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0]; return scale[match] || 0; }
                    return 0; 
                });
            } else questionScores.value = [];
            gradingModal.value = true; 
        };

        const updateTotalScore = () => { manualScore.value = parseFloat(questionScores.value.reduce((sum, score) => sum + (parseFloat(score) || 0), 0).toFixed(2)); };
        const saveManualGrade = async () => {
            let updatedLog = currentGradingResult.value.studentAnswersLog ? currentGradingResult.value.studentAnswersLog.map((ans, i) => ({ ...ans, score: questionScores.value[i] || 0 })) : null;
            const { error } = await supabaseClient.from('results').update({ score: parseFloat(manualScore.value), status: 'graded', studentAnswersLog: updatedLog || currentGradingResult.value.studentAnswersLog }).eq('id', currentGradingResult.value.id);
            if (!error) {
                const idx = allResults.value.findIndex(r => r.id === currentGradingResult.value.id);
                if (idx !== -1) { allResults.value[idx].score = parseFloat(manualScore.value); allResults.value[idx].status = 'graded'; if (updatedLog) allResults.value[idx].studentAnswersLog = updatedLog; }
                gradingModal.value = false; showNotify("Đã lưu điểm bài thi thành công!");
            } else showNotify("Lỗi CSDL khi lưu điểm: " + error.message, "error");
        };

        const backgroundAIGrading = async (resRec, examData) => {
            const promises = examData.questions.map(async (q, i) => {
                const ans = resRec.studentAnswersLog[i]; const p = q.points || 0;
                if ((q.type === 'mc' || q.type === 'tf') && ans.choice === q.correct) return p;
                if ((q.type === 'sa' || q.type === 'essay') && (ans.text.trim() !== '' || ans.fileData)) {
                    try {
                        const prompt = `Chấm điểm câu trả lời sau: Yêu cầu: "${q.text}". Học sinh trả lời: "${ans.text}". Trả về MỘT SỐ NGUYÊN DUY NHẤT TỪ 0 ĐẾN 100 thể hiện phần trăm mức độ chính xác của câu trả lời. Không cần giải thích thêm.`;
                        const { data } = await supabaseClient.functions.invoke('generate-exam', { body: { prompt: prompt, imageBase64: ans.fileData?.split(',')[1] } });
                        if (data?.candidates) return (parseFloat(data.candidates[0].content.parts[0].text.replace(/[^0-9.]/g, '')) / 100) * p;
                    } catch(e) { console.error("AI Grading Error", e); }
                }
                return 0;
            });
            const scores = await Promise.all(promises); const total = scores.reduce((a, b) => a + b, 0);
            await supabaseClient.from('results').update({ score: total, status: 'graded' }).eq('id', resRec.id);
            const idx = allResults.value.findIndex(r => r.id === resRec.id); if (idx !== -1) { allResults.value[idx].score = total; allResults.value[idx].status = 'graded'; }
        };

        // ==========================================
        // QUẢN LÝ LÀM BÀI (HỌC SINH)
        // ==========================================
       const startExam = (exam) => {
    // 1. TỰ ĐỘNG KÍCH HOẠT CHẾ ĐỘ TOÀN MÀN HÌNH NGAY LẬP TỨC
    enterFullScreen();

    // 2. KIỂM TRA MẬT KHẨU TRUY CẬP (NẾU CÓ)
    if (exam.settings?.password) {
        const p = prompt("Vui lòng nhập mật khẩu phòng thi để bắt đầu:");
        if (p !== exam.settings.password) {
            // Nếu sai mật khẩu, thoát chế độ toàn màn hình và dừng lại
            if (document.exitFullscreen) document.exitFullscreen();
            showNotify("Sai mật khẩu truy cập!", "error");
            return;
        }
    }

    // Tạo bản sao đề thi để xử lý xáo trộn mà không ảnh hưởng dữ liệu gốc
    let examCopy = JSON.parse(JSON.stringify(exam));

    // 3. LOGIC XÁO TRỘN ĐỀ THI (SHUFFLE)
    if (examCopy.type === 'quiz') {
        // Phân loại câu hỏi thành các nhóm riêng biệt để xáo trộn trong nội bộ từng phần
        const sections = {
            mc: examCopy.questions.filter(q => q.type === 'mc'),
            tf: examCopy.questions.filter(q => q.type === 'tf'),
            sa: examCopy.questions.filter(q => q.type === 'sa'),
            essay: examCopy.questions.filter(q => q.type === 'essay')
        };

        // Chỉ xáo trộn nếu chế độ shuffleMode được bật trong settings
        if (examCopy.settings?.shuffleMode !== false) {
            Object.keys(sections).forEach(key => {
                // Xáo trộn thứ tự câu hỏi trong từng phần
                sections[key] = shuffleArray(sections[key]);
                
                // Riêng trắc nghiệm (mc), xáo trộn thêm thứ tự các phương án A, B, C, D
                if (key === 'mc') {
                    sections[key].forEach(q => {
                        if (q.options && q.options.length > 0) {
                            const correctContent = q.options[q.correct];
                            q.options = shuffleArray(q.options);
                            q.correct = q.options.indexOf(correctContent);
                        }
                    });
                }
            });
        }
        // Gộp các phần lại theo đúng thứ tự hiển thị: I -> II -> III -> IV
        examCopy.questions = [...sections.mc, ...sections.tf, ...sections.sa, ...sections.essay];
    }

    // 4. KHỞI TẠO TRẠNG THÁI LÀM BÀI CHO HỌC SINH
    studentAnswers.value = examCopy.questions.map(q => ({
        // Đúng/Sai cần mảng 4 giá trị, các loại khác để null hoặc rỗng
        choice: q.type === 'tf' ? [null, null, null, null] : null,
        text: '',
        fileData: null
    }));

    currentExam.value = examCopy;
    timeLeft.value = examCopy.time * 60; // Quy đổi phút sang giây
    cheatWarnings.value = 0;
    view.value = 'exam-room'; // Chuyển giao diện sang phòng thi

    // 5. THIẾT LẬP GIÁM SÁT REAL-TIME (PHÒNG THI 4.0)
    if (studentChannel) supabaseClient.removeChannel(studentChannel);
    studentChannel = supabaseClient.channel('room-' + exam.id);
    studentChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await sendRealtimeUpdate('Vừa vào phòng thi');
        }
    });

    // 6. BẮT ĐẦU BỘ ĐẾM GIỜ LÀM BÀI
    if (timerInterval.value) clearInterval(timerInterval.value);
    timerInterval.value = setInterval(() => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
            
            // TỰ ĐỘNG THU BÀI NẾU HẾT HẠN KHÓA ĐỀ (CLOSED AT)
            if (currentExam.value?.settings?.closedAt) {
                const closeTime = new Date(currentExam.value.settings.closedAt);
                if (new Date() >= closeTime) {
                    clearInterval(timerInterval.value);
                    alert("Đã hết giờ làm bài theo quy định khóa đề của giáo viên!");
                    submitExam(); // Tự động nộp bài (isManual = false)
                }
            }
        } else {
            // Hết thời gian làm bài chính thức
            clearInterval(timerInterval.value);
            alert("Hết giờ làm bài! Hệ thống tự động nộp bài.");
            submitExam();
        }
    }, 1000);

    console.log("Phòng thi đã sẵn sàng:", examCopy.title);
};

        const handleFileUpload = (event) => { const f = event.target.files[0]; if(f) { const r = new FileReader(); r.onload = (e) => studentFile.value = e.target.result; r.readAsDataURL(f); } };
        const handlePerQuestionFileUpload = (event, idx) => { const f = event.target.files[0]; if(f) { const r = new FileReader(); r.onload = (e) => studentAnswers.value[idx].fileData = e.target.result; r.readAsDataURL(f); } };
        const formattedTime = computed(() => { const m = Math.floor(timeLeft.value / 60); const s = timeLeft.value % 60; return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; });

const submitExam = async (isManual = false) => {
    // 1. KIỂM TRA XÁC NHẬN NẾU HỌC SINH TỰ BẤM NỘP
    if (isManual) {
        const totalQuestions = currentExam.value.questions.length;
        const answeredCount = studentAnswers.value.filter((ans, idx) => {
            const q = currentExam.value.questions[idx];
            if (q.type === 'tf') return ans.choice && ans.choice.filter(c => c !== null).length === 4;
            if (q.type === 'mc') return ans.choice !== null;
            return (ans.text && ans.text.trim() !== '') || ans.fileData !== null;
        }).length;

        const confirmMsg = answeredCount < totalQuestions 
            ? `Bạn mới hoàn thành ${answeredCount}/${totalQuestions} câu. Bạn có chắc chắn muốn nộp bài không?`
            : "Bạn đã làm hết các câu hỏi. Xác nhận kết thúc bài thi và nộp bài?";
        
        if (!confirm(confirmMsg)) return;
    }

    // 2. DỪNG CÁC TRÌNH THEO DÕI VÀ THỜI GIAN
    if (timerInterval.value) clearInterval(timerInterval.value);
    
    // Cập nhật trạng thái cuối cùng cho giáo viên qua Realtime
    if (studentChannel) {
        const status = cheatWarnings.value >= 3 ? 'Bị thu bài (Gian lận)' : 'Đã nộp bài';
        await sendRealtimeUpdate(status);
        supabaseClient.removeChannel(studentChannel);
    }

    // Hiển thị trạng thái đang xử lý
    isAIGradingSubmission.value = true;

    // 3. TÍNH ĐIỂM TRẮC NGHIỆM & CHUẨN BỊ DỮ LIỆU
    if (currentExam.value.type === 'quiz') {
        let userScore = 0;
        let correctCount = 0;
        let hasEssay = false;

        currentExam.value.questions.forEach((q, i) => {
            const ans = studentAnswers.value[i];
            const p = q.points || 0;

            if (q.type === 'mc') {
                if (ans.choice === q.correct) {
                    correctCount++;
                    userScore += p;
                }
            } 
            else if (q.type === 'tf') {
                let match = 0;
                for (let j = 0; j < 4; j++) {
                    if (ans.choice && ans.choice[j] === q.correct[j]) match++;
                }
                if (match > 0) correctCount++;
                let scale = currentExam.value.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0];
                userScore += (scale[match] || 0);
            } 
            else if (q.type === 'sa' || q.type === 'essay') {
                if (ans.text.trim() !== '' || ans.fileData) hasEssay = true;
            }
        });

        // 4. LƯU KẾT QUẢ VÀO CƠ SỞ DỮ LIỆU
        const resData = { 
            id: Date.now(), 
            examId: currentExam.value.id, 
            studentName: currentUser.value.name, 
            submittedAt: new Date().toLocaleString('vi-VN'), 
            type: currentExam.value.type, 
            cheats: cheatWarnings.value, 
            score: parseFloat(userScore.toFixed(2)), 
            correct: correctCount, 
            studentAnswersLog: studentAnswers.value, 
            status: hasEssay ? 'grading' : 'graded' 
        };

        const { error } = await supabaseClient.from('results').insert([resData]);
        isAIGradingSubmission.value = false;

        if (!error) {
            allResults.value.push(resData);
            finalResult.value = { score: userScore, correct: correctCount };
            
            // Thoát chế độ toàn màn hình khi nộp xong
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen();
            }

            view.value = 'result';
            showNotify(cheatWarnings.value >= 3 ? "Hệ thống đã tự động thu bài do vi phạm!" : "Nộp bài thành công!");
            
            // Nếu có tự luận, chạy AI chấm điểm ngầm
            if (hasEssay) backgroundAIGrading(resData, currentExam.value); 
        } else {
            showNotify("Lỗi nộp bài: " + error.message, "error");
        }
    } 
    // TRƯỜNG HỢP NỘP FILE TỰ LUẬN DUY NHẤT
    else {
        const resData = { 
            id: Date.now(), 
            examId: currentExam.value.id, 
            studentName: currentUser.value.name, 
            submittedAt: new Date().toLocaleString('vi-VN'), 
            type: currentExam.value.type, 
            cheats: cheatWarnings.value, 
            fileData: studentFile.value, 
            score: 0, 
            status: 'pending' 
        };
        const { error } = await supabaseClient.from('results').insert([resData]);
        if (!error) {
            allResults.value.push(resData);
            if (document.exitFullscreen) document.exitFullscreen();
            view.value = 'student-dash';
            showNotify("Đã nộp bài tự luận thành công!");
        }
    }
};

// Thêm hàm cuộn tới câu hỏi (Helper function)
const scrollToQuestion = (idx) => {
    const el = document.getElementById('question-' + idx);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};



        const joinExamByCode = () => {
            if (!joinCode.value.trim()) return showNotify("Vui lòng nhập mã phòng thi!", "error"); 
            const ex = exams.value.find(e => e.examCode === joinCode.value.trim().toUpperCase());
            if (!ex) return showNotify("Mã không đúng hoặc phòng thi không tồn tại", "error"); 
            startExam(ex); 
            joinCode.value = '';
        };
const openQrModal = (exam) => { 
            currentQrCode.value = exam.examCode; 
            currentQrExamTitle.value = exam.title; 
            showQrModal.value = true; 
        };
        const visibleExamsForStudent = computed(() => {
    return exams.value.filter(exam => {
        const settings = exam.settings;
        if (!settings) return false;

        const now = currentTime.value;
        const scheduledDate = settings.scheduledAt ? new Date(settings.scheduledAt) : null;
        const closedDate = settings.closedAt ? new Date(settings.closedAt) : null;

        if (closedDate && now >= closedDate) return false;
        if (settings.isPublished) return true;
        if (scheduledDate && now >= scheduledDate) return true;

        return false;
    });
});
const saveExamFast = async (exam) => {
    const { error } = await supabaseClient.from('exams').update({ settings: exam.settings }).eq('id', exam.id);
    if (!error) {
        showNotify("Đã giao bài thi thành công!");
    } else {
        showNotify("Lỗi: " + error.message, "error");
    }
};
const quickPublish = async (exam) => {
    try {
        const updatedSettings = { 
            ...(exam.settings || {}), 
            isPublished: true,
            scheduledAt: null 
        };
        const { error } = await supabaseClient.from('exams').update({ settings: updatedSettings }).eq('id', exam.id);
        if (error) throw error;
        exam.settings = updatedSettings;
        showNotify("Đã giao bài thi thành công!");
    } catch (error) {
        showNotify("Lỗi: " + error.message, "error");
    }
};

const unpublishExam = async (exam) => {
    if (!confirm("Thu hồi đề thi này? Học sinh sẽ không thấy đề này nữa.")) return;
    try {
        const updatedSettings = { 
            ...(exam.settings || {}), 
            isPublished: false 
        };
        const { error } = await supabaseClient.from('exams').update({ settings: updatedSettings }).eq('id', exam.id);
        if (error) throw error;
        exam.settings = updatedSettings;
        showNotify("Đã thu hồi về bản nháp!");
    } catch (error) {
        showNotify("Lỗi: " + error.message, "error");
    }
};

// app.js

const subscribeToExamChanges = () => {
    console.log("Đang bắt đầu lắng nghe Realtime..."); // Để kiểm tra xem hàm có chạy không
    
    supabaseClient
        .channel('exams-realtime-channel') // Đặt tên kênh bất kỳ
        .on(
            'postgres_changes',
            {
                event: '*', // Nghe tất cả: INSERT (thêm mới), UPDATE (sửa), DELETE (xóa)
                schema: 'public',
                table: 'exams'
            },
            (payload) => {
                console.log('Phát hiện thay đổi CSDL:', payload);

                if (payload.eventType === 'INSERT') {
                    // Khi giáo viên thêm đề mới, đẩy vào mảng exams
                    exams.value.push(payload.new);
                } 
                else if (payload.eventType === 'UPDATE') {
                    // Khi giáo viên Giao bài, Thu hồi hoặc Sửa bài
                    const index = exams.value.findIndex(e => e.id === payload.new.id);
                    if (index !== -1) {
                        exams.value[index] = payload.new;
                    }
                } 
                else if (payload.eventType === 'DELETE') {
                    // Khi giáo viên xóa đề
                    exams.value = exams.value.filter(e => e.id !== payload.old.id);
                }
                
                // Hiển thị thông báo nhỏ để biết hệ thống đã cập nhật
                showNotify("Dữ liệu đề thi vừa được cập nhật!");
            }
        )
        .subscribe((status) => {
            console.log("Trạng thái kết nối Realtime:", status);
        });
};


        // app.js - Tìm khối return ở cuối setup()
return {
    unpublishExam,
    quickPublish,
    visibleExamsForStudent, // Thêm dòng này nếu chưa có
    saveExamFast,           // Thêm dòng này
            // --- CÁC BIẾN & HÀM MỚI BỔ SUNG ---
            activeQuestionTab,
            filteredEditorQuestions,
            enterFullScreen,
            isFullscreen,

            // --- TRẠNG THÁI HỆ THỐNG & AUTH ---
            view, 
            currentUser, 
            authForm, 
            users, 
            exams, 
            newExam, 
            teacherTab, 
            notification, 
            searchUser,
            showNotify, 
            handleLogin, 
            handleRegister, 
            logout, 
            goHome, 
            switchView,

            // --- QUẢN LÝ NGƯỜI DÙNG (ADMIN) ---
            getRoleName, 
            getRoleBadgeClass, 
            deleteUser, 
            updateUserRole, 
            filteredUsers, 
            openEditModal, 
            saveUserEdit, 
            openAddModal, 
            saveNewUser,

            // --- SOẠN THẢO ĐỀ THI (TEACHER) ---
            addQuestion, 
            removeQuestion, 
            saveExam, 
            openEditExam, 
            openCreateNewExam, 
            deleteExam, 
            viewResults, 
            showSettingsModal,
            aiPrompt, 
            isGenerating, 
            aiMatrix, 
            aiUploadedImage, 
            aiUploadedFileName,
            handleAiFileUpload, 
            handleGenerateAI, 
            exportToWord,

            // --- PHÒNG THI & LÀM BÀI (STUDENT) ---
            currentExam, 
            studentAnswers, 
            studentFile, 
            timeLeft, 
            formattedTime, 
            finalResult, 
            cheatWarnings, 
            startExam, 
            submitExam,
            joinCode, 
            joinExamByCode,
            handleFileUpload, 
            handlePerQuestionFileUpload,
            scrollToQuestion,

            // --- CHẤM ĐIỂM & GIÁM SÁT ---
            gradingModal, 
            currentGradingResult, 
            manualScore, 
            questionScores, 
            allResults, 
            filteredResults,
            openGradingModal, 
            saveManualGrade, 
            updateTotalScore, 
            backgroundAIGrading,
            isAIGradingSubmission,
            monitoringExamId, 
            isMonitoring, 
            activeStudents, 
            startMonitoring,
            sendRealtimeUpdate,

            // --- TRÌNH CHIẾU & TIỆN ÍCH ---
            currentSlide, 
            showSlideAnswer, 
            startPresentation, 
            nextSlide, 
            prevSlide, 
            exitPresentation,
            showQrModal, 
            currentQrCode, 
            currentQrExamTitle, 
            openQrModal
        };
    }
}).mount('#app');