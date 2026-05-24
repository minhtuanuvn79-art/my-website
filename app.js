const { createApp, ref, computed, onMounted, watch } = Vue;

const supabaseUrl = 'https://dtfdzuggnitsdnlutryn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmR6dWdnbml0c2RubHV0cnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mjk0NTAsImV4cCI6MjA5MDUwNTQ1MH0.9Ne1ONIO9-ASkThtFZJLxV42dbyIMGkHwweIjTZ5A6Q';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let realtimeChannel = null;
let examRoomChannel = null;
createApp({
    setup() {
        // Lấy lại trang và tab cũ từ bộ nhớ trình duyệt (nếu có)
const savedView = localStorage.getItem('eduexam_current_view') || 'login';
const savedTab = localStorage.getItem('eduexam_teacher_tab') || 'exams';

const isConfirmingSubmit = ref(false); // Biến chặn phạt khi đang hỏi nộp bài
const showMobileQuestionMap = ref(false);

const view = ref(savedView);
const liveMonitors = ref([]);
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
        const searchUserQuery = ref('');
        const filterRole = ref('all'); // Chuyển từ dòng 736 lên đây
        const currentPage = ref(1);    // Chuyển lên đây
        const itemsPerPage = 20;       // Chuyển lên đây
        
const showEditModal = ref(false);
const editUserData = ref({ id: null, name: '', password: '', role: 'student' });
const showDeleteConfirm = ref(false);
const userToDelete = ref(null);
const selectedUsers = ref([]);
const showBulkDeleteConfirm = ref(false);
        // Các biến hỗ trợ khác
        const isFullscreen = ref(false);
        const cheatWarnings = ref(0);
        const timeLeft = ref(0);
        const timerInterval = ref(null);
        const studentAnswers = ref([]);
// Biến lưu trữ bộ lọc môn học hiện tại đang chọn ở Kho đề
const selectedSubjectFilter = ref('');

// TỰ ĐỘNG QUÉT CSDL: Lọc ra danh sách các môn học không trùng lặp từ tất cả các đề đang có
const uniqueSubjects = computed(() => {
    // SỬA Ở ĐÂY: Đổi allExams.value thành exams.value
    const allSubjects = exams.value.map(exam => exam.subject).filter(sub => sub && sub.trim() !== '');
    return [...new Set(allSubjects)].sort();
});
// Thay thế đoạn watch hiện tại bằng đoạn này
watch(studentAnswers, (newVal) => {
    if (view.value === 'exam-room' && currentExam.value) {
        // Lưu backup đáp án
        localStorage.setItem(`eduexam_backup_${currentExam.value.id}`, JSON.stringify(newVal));
        // Lưu backup bộ đề (đã xáo trộn) để học sinh reload trang không bị xáo lại từ đầu
        localStorage.setItem(`eduexam_backup_exam_${currentExam.value.id}`, JSON.stringify(currentExam.value));
    }
}, { deep: true });
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
        const cheatMessage = ref('');

const searchExam = ref('');
const searchResultQuery = ref(''); // Biến lưu từ khóa tìm kiếm học sinh
const filteredExams = computed(() => {
    // SỬA Ở ĐÂY: Đổi allExams.value thành exams.value
    let result = exams.value;

    // 1. Lọc theo từ khóa (Tìm tên đề thi)
    if (searchExam.value.trim()) {
        const term = searchExam.value.toLowerCase().trim();
        result = result.filter(exam => exam.title.toLowerCase().includes(term));
    }

    // 2. Lọc theo Môn học (NẾU CÓ CHỌN)
    if (selectedSubjectFilter.value) {
        result = result.filter(exam => exam.subject === selectedSubjectFilter.value);
    }

    return result;
});
const isExamStarting = ref(false); // Biến chặn cảnh báo khi vừa vào
const showFullscreenOverlay = ref(false);
const sessionId = ref(Math.random().toString(36).substring(2, 10)); // ID phiên làm việc
const studentFile = ref(null);       // File nộp bài tự luận của học sinh
const isAIGradingSubmission = ref(false); // Trạng thái AI đang chấm bài khi nộp\
const defaultSettings = {
    scoreVisibility: 'always',
    answerVisibility: 'always', // Đổi mặc định thành always để test cho dễ
    attemptLimit: 0,
    password: '',
    autoMonitor: true,
    shuffleMode: true,
    tfGradingScale: [0, 0.1, 0.25, 0.5, 1.0],
    isPublished: false,
    scheduledAt: null,
    closedAt: null
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
        
        // --- THÊM DÒNG NÀY ĐỂ CHẶN ĐẾM TRÙNG ---
        if (showFullscreenOverlay.value) return;

        if (currentExam.value?.settings?.autoMonitor !== false) {
            cheatWarnings.value++;
            cheatMessage.value = `Bạn vừa thực hiện hành vi chuyển Tab hoặc rời khỏi trình duyệt.`;
            showFullscreenOverlay.value = true;

            if (cheatWarnings.value >= 3) {
                showNotify("Vi phạm quá 3 lần. Hệ thống tự động thu bài!", "error");
                submitExam(false); 
            }
        }
    }
};
const handleWindowBlur = () => {
    // 1. Kiểm tra môi trường: Chỉ kích hoạt khi đang ở phòng thi, 
    // không phải lúc AI đang chấm bài và KHÔNG phải lúc đang hiện bảng hỏi nộp bài
    if (view.value === 'exam-room' && !isAIGradingSubmission.value && !isConfirmingSubmit.value) {
        
        // 2. Chặn đếm trùng: Nếu cảnh báo Fullscreen đã hiện thì không xử lý Blur nữa
        if (showFullscreenOverlay.value) return; 

        // 3. Kiểm tra cài đặt đề thi: Nếu giáo viên tắt giám sát tự động thì bỏ qua
        if (currentExam.value?.settings?.autoMonitor !== false) {
            
            // 4. XỬ LÝ ĐẶC BIỆT CHO ĐIỆN THOẠI:
            // Thêm một khoảng trễ 200ms để tránh việc trình duyệt hiểu lầm 
            // khi học sinh tương tác với các thành phần hệ thống (như bàn phím)
            setTimeout(() => {
                // Kiểm tra lại lần nữa: Thực sự mất tiêu điểm (document.hasFocus() là false)
                // và vẫn không phải đang trong trạng thái xác nhận nộp bài
                if (!document.hasFocus() && !isConfirmingSubmit.value) {
                    cheatWarnings.value++;
                    sendRealtimeUpdate();
                    
                    // Thông báo cụ thể lý do vi phạm
                    cheatMessage.value = `Bạn vừa mất tiêu điểm khỏi bài thi (Click ra ngoài, kéo thanh thông báo hoặc mở app khác).`;
                    showFullscreenOverlay.value = true;

                    // 5. Tự động thu bài nếu vi phạm quá số lần quy định (3 lần)
                    if (cheatWarnings.value >= 3) {
                        showNotify("Vi phạm quá 3 lần. Hệ thống tự động thu bài!", "error");
                        submitExam(false); 
                    }
                }
            }, 200);
        }
    }
};
const handleFullscreenChange = () => {
    const isFull = !!(document.fullscreenElement || 
                      document.webkitFullscreenElement || 
                      document.mozFullScreenElement || 
                      document.msFullscreenElement);
    
    isFullscreen.value = isFull; 

    // Nhận diện điện thoại
    const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    if (view.value === 'exam-room') {
        if (!isFull && !isExamStarting.value) {
            if (isAIGradingSubmission.value) return;
            if (showFullscreenOverlay.value) return;

            // NẾU LÀ ĐIỆN THOẠI -> KHÔNG PHẠT LỖI FULLSCREEN NỮA!
            if (isMobile) {
                return; // Thoát luôn, không báo vi phạm.
            }

            setTimeout(() => {
                const reCheckFull = !!(document.fullscreenElement || 
                                     document.webkitFullscreenElement || 
                                     document.mozFullScreenElement || 
                                     document.msFullscreenElement);
                
                if (!reCheckFull) {
                    cheatWarnings.value++;
                    sendRealtimeUpdate();
                    cheatMessage.value = `Bạn vừa thoát khỏi chế độ Toàn màn hình (Fullscreen). Vui lòng quay lại để tiếp tục bài thi.`;
                    showFullscreenOverlay.value = true;

                    if (cheatWarnings.value >= 3) {
                        showNotify("Vi phạm quá 3 lần. Hệ thống tự động thu bài!", "error");
                        showFullscreenOverlay.value = false;
                        submitExam(false); 
                    }
                }
            }, 300);

        } else if (isFull) {
            showFullscreenOverlay.value = false;
        }
    }
};
const enterFullScreen = () => {
    // Nhận diện điện thoại (Màn hình nhỏ hoặc có chuỗi Mobile/iPhone/Android)
    const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    
    // Nếu là điện thoại, bỏ qua việc ép Fullscreen
    if (isMobile) return; 

    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.warn("Lỗi Fullscreen:", err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
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
    try {
        // Tải đề thi
        const { data: examData } = await supabaseClient.from('exams').select('*').order('id', { ascending: false });
        if (examData) exams.value = examData;

        // TẢI NGƯỜI DÙNG: Chỉ lấy từ Database
        const { data: userData } = await supabaseClient.from('users').select('*');
        if (userData) {
            users.value = userData; // Loại bỏ [...FIXED_ACCOUNTS]
        }
        
        console.log("✅ Dữ liệu người dùng đã đồng bộ từ Cloud");
    } catch (err) {
        console.error("Lỗi loadData:", err);
    }
};
const fetchResults = async () => {
    try {
        const { data, error } = await supabaseClient
            .from('results')
            .select('*')
            .order('id', { ascending: false });
        
        if (error) throw error;
        if (data) allResults.value = data;
    } catch (err) {
        console.error("Lỗi khi tải kết quả:", err.message);
    }
};
const fetchUsers = async () => {
    const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        showNotify("Lỗi tải danh sách người dùng", "error");
    } else {
        // Chỉ gán dữ liệu từ DB, không gộp FIXED_ACCOUNTS
        users.value = data || []; 
    }
};
const addUser = async () => {
    if (!newUserName.value || !newUserPass.value) return;

    const { data, error } = await supabaseClient
        .from('users')
        .insert([{ 
            name: newUserName.value, 
            password: newUserPass.value, 
            role: newUserRole.value 
        }])
        .select(); // Thêm .select() để lấy dữ liệu vừa tạo

    if (!error) {
        // Cập nhật ngay vào danh sách hiển thị
        if (data) users.value.unshift(data[0]); 
        showAddUserModal.value = false;
        newUserName.value = ''; newUserPass.value = '';
        showNotify("Thêm tài khoản thành công!");
    } else {
        showNotify("Lỗi: " + error.message, "error");
    }
};
        let isRealtimeSubscribed = false;
onMounted(async () => {
    // 1. TẢI DỮ LIỆU CƠ BẢN TUẦN TỰ
    try {
        // Tải danh sách người dùng ngay lập tức để phục vụ Đăng nhập/Quản trị
        await fetchUsers();

        // Dãn cách 500ms để trình duyệt rảnh tay tải Font/CSS (Tránh lỗi INSUFFICIENT_RESOURCES)
setTimeout(async () => {
            await loadData();
            await fetchResults();
            
            // Khôi phục phiên đăng nhập nếu có
            const savedUser = localStorage.getItem('eduexam_user');
            if (savedUser) {
                currentUser.value = JSON.parse(savedUser);
                subscribeToExamChanges();
            }

            // === BỔ SUNG CODE: TỰ ĐỘNG KHÔI PHỤC RADAR KHI F5 ===
            if (currentUser.value && (currentUser.value.role === 'teacher' || currentUser.value.role === 'admin') && teacherTab.value === 'monitor') {
                const savedMonitorId = localStorage.getItem('eduexam_monitor_exam_id');
                if (savedMonitorId) {
                    const examToMonitor = exams.value.find(e => e.id == savedMonitorId);
                    if (examToMonitor) {
                        openLiveMonitor(examToMonitor);
                    } else {
                        teacherTab.value = 'exams'; 
                    }
                } else {
                    teacherTab.value = 'exams';
                }
            }
            // ====================================================

        }, 500);
    } catch (err) {
        console.warn("Dữ liệu ban đầu chưa tải hết:", err);
    }

    // 2. ĐĂNG KÝ CÁC SỰ KIỆN GIÁM SÁT GIAN LẬN
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // 3. CHẶN CHUỘT PHẢI TRONG PHÒNG THI
    document.addEventListener('contextmenu', (e) => {
        if (view.value === 'exam-room') {
            e.preventDefault();
            showNotify("Hành động chuột phải bị chặn trong phòng thi!", "error");
        }
    });

    // 4. CHẶN PHÍM TẮT GIAN LẬN (F12, Ctrl+C, Ctrl+V, ESC)
    document.addEventListener('keydown', (e) => {
        if (view.value === 'exam-room') {
            
            // Bắt phím Esc khi thoát Fullscreen
            if (e.key === 'Escape' || e.keyCode === 27) {
                setTimeout(() => { handleFullscreenChange(); }, 100);
            }

            // Chặn F12
            if (e.key === 'F12') {
                e.preventDefault();
                cheatWarnings.value++;
                cheatMessage.value = `Bạn vừa cố gắng mở công cụ nhà phát triển (F12).`;
                showFullscreenOverlay.value = true;
            }
            
            // Chặn Copy, Paste, View Source
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'u', 's'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                cheatWarnings.value++;
                cheatMessage.value = `Bạn vừa cố gắng sử dụng phím tắt bị chặn.`;
                showFullscreenOverlay.value = true;
            }
        }
    });

    // 5. KHỞI TẠO CÔNG THỨC TOÁN HỌC MATHJAX
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise();
    }
    
    console.log("🚀 EduExam System: Giám sát và Bảo mật đã sẵn sàng!");
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

const handleLogin = async () => {
    if (!authForm.value.name.trim() || !authForm.value.password.trim()) {
        return showNotify("Vui lòng nhập tên và mật khẩu", "error");
    }
    
    try {
        // Truy vấn trực tiếp từ Supabase
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('name', authForm.value.name)
            .maybeSingle();
        
        if (error) throw error;

        if (!user) {
            return showNotify("Tài khoản không tồn tại", "error");
        }
        
        if (user.password !== authForm.value.password) {
            return showNotify("Mật khẩu không chính xác", "error");
        }

        // Lưu thông tin và điều hướng
        currentUser.value = user;
        localStorage.setItem('eduexam_user', JSON.stringify(user));
        
        if (user.role === 'admin' || user.role === 'teacher') {
            view.value = 'teacher-dash';
            teacherTab.value = 'exams';
        } else {
            view.value = 'student-dash';
        }
        
        showNotify(`Chào mừng ${user.name}!`);
        subscribeToExamChanges();
    } catch (err) {
        console.error("Lỗi đăng nhập:", err.message);
        return showNotify("Lỗi kết nối hệ thống", "error");
    }
};

const logout = () => {
    if (view.value === 'exam-room' && !confirm("Đăng xuất khi đang thi?")) return;

    // NGẮT TOÀN BỘ KẾT NỐI KHI ĐĂNG XUẤT ĐỂ TRÁNH TRÙNG LẶP DỮ LIỆU
    if (examRoomChannel) supabaseClient.removeChannel(examRoomChannel);
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    examRoomChannel = null;
    realtimeChannel = null;

    localStorage.clear();
    currentUser.value = null;
    view.value = 'login';
    showNotify("Đã đăng xuất!");
};

const goHome = () => {
    if (view.value === 'exam-room' && !confirm("Rời khỏi phòng thi?")) return;
    
    currentExam.value = null; 
    if (view.value === 'presentation') exitPresentation();
    
    // SỬA TẠI ĐÂY: Admin bấm Home sẽ về Teacher Dash
    if (currentUser.value?.role === 'admin' || currentUser.value?.role === 'teacher') {
        view.value = 'teacher-dash';
    } else {
        view.value = 'student-dash';
    }
};

// 1. Lọc theo tìm kiếm và theo Vai trò
const filteredUsers = computed(() => {
    // Bây giờ filterRole đã tồn tại nên sẽ không lỗi nữa
    let result = users.value.filter(u => 
        u.name.toLowerCase().includes(searchUserQuery.value.toLowerCase())
    );

    if (filterRole.value !== 'all') {
        result = result.filter(u => u.role === filterRole.value);
    }
    return result;
});
// Thêm vào trong phần setup() của Vue app trong app.js
const getOffset = (type) => {
    if (!printData.value || !printData.value.questions) return 0;
    if (type === 'mc') return printData.value.questions.filter(q => q.type === 'mc').length;
    return 0;
};

const getTfScore = (idx, q) => {
    const studentAns = printData.value.studentAnswersLog[idx + getOffset('mc')];
    if (!studentAns || !studentAns.choice) return 0;
    
    let match = 0;
    for (let i = 0; i < 4; i++) {
        if (studentAns.choice[i] === q.correct[i]) match++;
    }
    const scale = [0, 0.1, 0.25, 0.5, 1.0]; // Thang điểm chuẩn
    return (scale[match] * (q.points || 1)).toFixed(2);
};


const paginatedUsers = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredUsers.value.slice(start, end);
});

// 3. Tính tổng số trang
const totalPages = computed(() => {
    return Math.ceil(filteredUsers.value.length / itemsPerPage) || 1;
});

// Watcher: Reset về trang 1 khi người dùng lọc hoặc tìm kiếm
watch([searchUserQuery, filterRole], () => {
    currentPage.value = 1;
});
const deleteUser = (user) => { 
    if (user.name === 'admin') return showNotify("Không thể xóa tài khoản Admin hệ thống!", "error");
    userToDelete.value = user; // Gán user vào biến tạm
    showDeleteConfirm.value = true; // Mở Modal
};

const confirmDeleteUser = async () => {
    if (!userToDelete.value) return;
    try {
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('id', userToDelete.value.id);

        if (!error) { 
            users.value = users.value.filter(u => u.id !== userToDelete.value.id); 
            showNotify(`Đã xóa tài khoản "${userToDelete.value.name}"`); 
            showDeleteConfirm.value = false;
            userToDelete.value = null;
        } else {
            showNotify("Lỗi xóa: " + error.message, "error");
        }
    } catch (err) {
        showNotify("Lỗi hệ thống", "error");
    }
};
const updateUserRole = async (user, newRole) => { 
    const { error } = await supabaseClient.from('users').update({ role: newRole }).eq('id', user.id); if (!error) { user.role = newRole; showNotify("Cập nhật quyền thành công."); }
};
const openEditModal = (user) => { 
    editUserData.value = { ...user }; // Sao chép dữ liệu để tránh sửa trực tiếp vào mảng gốc khi chưa nhấn Lưu
    showEditModal.value = true; 
};
const saveUserEdit = async () => {
    try {
        const { error } = await supabaseClient
            .from('users')
            .update({ 
                name: editUserData.value.name, 
                password: editUserData.value.password, 
                role: editUserData.value.role 
            })
            .eq('id', editUserData.value.id);

        if (!error) {
            // Tìm và cập nhật lại trong mảng đang hiển thị
            const index = users.value.findIndex(u => u.id === editUserData.value.id);
            if (index !== -1) {
                users.value[index] = { ...editUserData.value };
            }
            
            showEditModal.value = false;
            showNotify("Cập nhật tài khoản thành công!");
        } else {
            showNotify("Lỗi lưu dữ liệu: " + error.message, "error");
        }
    } catch (err) {
        showNotify("Lỗi kết nối database", "error");
    }
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

// Thêm biến này ở trên cùng setup() để theo dõi tiến độ trước đó
let lastSentProgress = -1;
let lastUpdateTime = 0; 


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
        subject: '',
        type: 'quiz', 
        time: 45, // Đã cập nhật mặc định thành 45 phút
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
        const deleteResult = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn kết quả bài làm này không? Hành động này không thể hoàn tác và sẽ giải phóng dung lượng CSDL.")) {
        return;
    }
    try {
        // Xóa bản ghi kết quả trên Supabase
        const { error } = await supabaseClient
            .from('results')
            .delete()
            .eq('id', id);

        if (!error) {
            // Cập nhật lại state cục bộ để giao diện biến mất ngay lập tức
            allResults.value = allResults.value.filter(r => r.id !== id);
            showNotify("Đã xóa kết quả bài làm thành công!");
        } else {
            showNotify("Lỗi khi xóa kết quả: " + error.message, "error");
        }
    } catch (err) {
        console.error("Lỗi hệ thống khi xóa kết quả:", err);
        showNotify("Không thể kết nối hệ thống", "error");
    }
};
const filteredResults = computed(() => {
    if (!currentExam.value) return [];
    
    // 1. Lọc toàn bộ kết quả của bài thi này từ mảng allResults
    const resultsForExam = allResults.value.filter(r => r.examId === currentExam.value.id);
    
    // 2. Nhóm theo tên học sinh để xử lý nếu học sinh làm bài nhiều lần
    const grouped = {};
    
    resultsForExam.forEach(r => {
        const studentId = r.studentName;
        
        if (!grouped[studentId]) {
            grouped[studentId] = { ...r, totalAttempts: 1 };
        } else {
            grouped[studentId].totalAttempts++;
            // CHỈ GIỮ LẠI BẢN GHI CÓ ĐIỂM CAO NHẤT ĐỂ HIỂN THỊ
            if (r.score > grouped[studentId].score) {
                const oldAttempts = grouped[studentId].totalAttempts;
                Object.assign(grouped[studentId], r);
                grouped[studentId].totalAttempts = oldAttempts;
            }
        }
    });
    
    // 3. Chuyển Object thành Mảng và sắp xếp
    let finalArray = Object.values(grouped).sort((a, b) => b.id - a.id);

    // 4. BỔ SUNG LỌC TÌM KIẾM THEO TÊN (Nếu người dùng có gõ tìm kiếm)
    if (searchResultQuery.value.trim()) {
        const term = searchResultQuery.value.toLowerCase().trim();
        finalArray = finalArray.filter(r => 
            r.studentName.toLowerCase().includes(term)
        );
    }
    
    // Trả về mảng danh sách bài làm đã qua xử lý
    return finalArray;
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
const scale = Math.min(1000 / img.width, 1);
canvas.width = img.width * scale;
canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
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
                    const viewport = page.getViewport({ scale: 0.8 });
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

const base64Img = finalCanvas.toDataURL('image/jpeg', 0.1); 
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
    showNotify("AI đang phân tích tài liệu...", "success");

    try {
const strictPrompt = `Bóc tách đề thi sau thành mảng JSON câu hỏi. 
        Cấu trúc: [{"type":"mc","text":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]
        Nội dung: ${aiPrompt.value.trim()}
        
        LƯU Ý QUAN TRỌNG: Nếu nội dung đề thi (Tin học) có chứa các đoạn mã code HTML (ví dụ: <br>, <h1>, <div>,...), bạn BẮT BUỘC phải mã hóa dấu "<" thành "&lt;" và dấu ">" thành "&gt;". Tuyệt đối không giữ nguyên thẻ HTML góc để tránh lỗi hiển thị trên giao diện.`;

        // Gọi Function
        const { data, error } = await supabaseClient.functions.invoke('generate-exam', { 
            body: { 
                prompt: strictPrompt, 
                imageBase64: aiImageBase64.value || null 
            } 
        });
        
        // Bắt lỗi từ Edge Function
if (error) {
    // Lấy nội dung lỗi từ Server trả về thay vì hiện "Lỗi 500" chung chung
    const errBody = await error.context?.json(); 
    throw new Error(errBody?.error || "AI đang bận, vui lòng thử lại sau.");
}
        
        // Xử lý dữ liệu trả về (đảm bảo lấy từ data.text)
        let rawJson = typeof data === 'string' ? data : data.text;
        const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        const questions = JSON.parse(cleanJson);

        newExam.value.questions = questions;
        showNotify(`Thành công! Đã bóc tách ${questions.length} câu.`);
        view.value = 'create-exam'; 
        
    } catch (err) { 
        console.error("Lỗi AI:", err);
        showNotify("Lỗi: " + err.message, "error"); 
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
    // 1. Gán kết quả hiện tại vào state để hiển thị thông tin học sinh
    currentGradingResult.value = result; 
    
    // 2. Tìm đề thi tương ứng để lấy nội dung câu hỏi gốc
    const exam = exams.value.find(e => e.id === result.examId);
    
    if (exam && result.studentAnswersLog) {
        // 3. Khởi tạo mảng điểm cho từng câu (questionScores)
        questionScores.value = result.studentAnswersLog.map((ans, i) => {
            // Nếu câu hỏi này đã được chấm tay trước đó (có thuộc tính score) thì lấy điểm đó
            if (ans.score !== undefined && ans.score !== null) {
                return ans.score; 
            }
            
            // Nếu chưa chấm tay, tính điểm mặc định dựa trên loại câu hỏi
            const q = exam.questions[i]; 
            if (!q) return 0;

            const p = parseFloat(q.points) || 0;

            // Tự động tính điểm cho Trắc nghiệm (Phần I)
            if (q.type === 'mc') {
                return (ans.choice === q.correct) ? p : 0;
            }

            // Tự động tính điểm cho Đúng/Sai (Phần II) theo thang điểm cấu hình
            if (q.type === 'tf') { 
                let match = 0; 
                if (Array.isArray(ans.choice)) {
                    for (let j = 0; j < 4; j++) {
                        if (ans.choice[j] === q.correct[j]) match++; 
                    }
                }
                const scale = exam.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0]; 
                return (scale[match] || 0) * p; 
            }

            // Đối với Tự luận (Phần III), mặc định để 0 để giáo viên tự nhập điểm sau khi đọc bài
            return 0; 
        });
    } else {
        // Nếu không có dữ liệu log bài làm, khởi tạo mảng rỗng
        questionScores.value = [];
    }

    // 4. Cập nhật lại tổng điểm hiển thị trên Modal
    updateTotalScore(); 
    
    // 5. Mở Modal giao diện
    gradingModal.value = true; 
};

const updateTotalScore = () => {
    const total = questionScores.value.reduce((sum, score) => {
        const num = parseFloat(score);
        return sum + (isNaN(num) ? 0 : num);
    }, 0);
    // Làm tròn đến 2 chữ số thập phân
    manualScore.value = Math.round(total * 100) / 100;
};
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

        const handleFileUpload = (event) => { const f = event.target.files[0]; if(f) { const r = new FileReader(); r.onload = (e) => studentFile.value = e.target.result; r.readAsDataURL(f); } };
        const handlePerQuestionFileUpload = (event, idx) => { const f = event.target.files[0]; if(f) { const r = new FileReader(); r.onload = (e) => studentAnswers.value[idx].fileData = e.target.result; r.readAsDataURL(f); } };
        const formattedTime = computed(() => { const m = Math.floor(timeLeft.value / 60); const s = timeLeft.value % 60; return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; });

const submitExam = async (isManual = false) => {
    // 1. Xử lý xác nhận nộp bài thủ công
    if (isManual) {
        isConfirmingSubmit.value = true; // Bật cờ chặn giám sát
        
        const confirmMsg = "Xác nhận kết thúc bài thi và nộp bài?";
        if (!confirm(confirmMsg)) {
            // Nếu học sinh bấm "Hủy":
            // Đợi 500ms để trình duyệt điện thoại ổn định lại tiêu điểm rồi mới bật lại giám sát
            setTimeout(() => {
                isConfirmingSubmit.value = false;
            }, 500);
            return;
        }
    }

    // 2. Chuyển trạng thái sang đang nộp (vô hiệu hóa các sự kiện blur/fullscreen)
    isAIGradingSubmission.value = true;
    if (examRoomChannel) {
        supabaseClient.removeChannel(examRoomChannel);
        examRoomChannel = null;
    }
    const previousView = view.value;
    view.value = 'result'; 

    // 3. Dừng bộ đếm thời gian
    if (timerInterval.value) clearInterval(timerInterval.value);
    
    // 4. Thoát chế độ toàn màn hình an toàn
    if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (err) { console.warn("Lỗi thoát Fullscreen:", err); }
    }

    try {
        let resData = null;
        const displayIdentity = `${studentProfile.value.fullName} - Lớp: ${studentProfile.value.className}`;

        // 5. XỬ LÝ CHẤM ĐIỂM VÀ DỊCH ĐÁP ÁN (Dành cho đề Quiz/Hỗn hợp)
        if (currentExam.value.type === 'quiz') {
            let userScore = 0;
            let correctCount = 0;
            let hasEssay = false;

            // TẠO MẢNG MỚI ĐỂ LƯU LOG ĐÁP ÁN ĐÃ DỊCH VỀ GỐC
            let finalAnswersLog = new Array(currentExam.value.questions.length);

            currentExam.value.questions.forEach((q, currentIdx) => {
                // Clone đáp án hiện tại ra để thao tác không ảnh hưởng UI
                let ans = JSON.parse(JSON.stringify(studentAnswers.value[currentIdx]));
                const p = parseFloat(q.points) || 0;

                // Chấm Phần I: Trắc nghiệm 1 đáp án
                if (q.type === 'mc') {
                    // Chấm điểm trước khi dịch về gốc
                    if (ans.choice === q.correct) {
                        correctCount++;
                        userScore += p;
                    }
                    // Dịch lựa chọn của HS về ký tự đáp án gốc (A, B, C, D) ban đầu
                    if (ans.choice !== null && q.originalOptionMap) {
                        ans.choice = q.originalOptionMap[ans.choice];
                    }
                } 
                // Chấm Phần II: Đúng/Sai dạng chùm 4 ý
                else if (q.type === 'tf') {
                    let match = 0;
                    if (ans.choice && Array.isArray(ans.choice)) {
                        for (let j = 0; j < 4; j++) {
                            if (ans.choice[j] === q.correct[j]) match++;
                        }
                    }
                    const scale = currentExam.value.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0];
                    userScore += (scale[match] || 0) * p;
                    if (match === 4) correctCount++;
                } 
                // Kiểm tra nếu có câu tự luận (Phần III)
                else if (q.type === 'sa' || q.type === 'essay') {
                    if ((ans.text && ans.text.trim() !== '') || ans.fileData) hasEssay = true;
                }

                // Sắp xếp câu trả lời này về đúng vị trí câu hỏi gốc
                let targetIdx = q.originalQIdx !== undefined ? q.originalQIdx : currentIdx;
                finalAnswersLog[targetIdx] = ans;
            });

            userScore = Math.round(userScore * 100) / 100;

            resData = { 
                id: Date.now(), 
                examId: currentExam.value.id, 
                studentName: displayIdentity, 
                submittedAt: new Date().toLocaleString('vi-VN'), 
                score: userScore, 
                correct: correctCount,
                cheats: cheatWarnings.value, 
                status: hasEssay ? 'pending' : 'graded',
                studentAnswersLog: finalAnswersLog // Ghi nhận mảng đáp án đã dịch chuẩn
            };

            finalResult.value = { score: userScore, correct: correctCount };
        } 
        // 6. XỬ LÝ CHẤM ĐIỂM (Dành cho đề Tự luận nộp File)
        else {
            resData = { 
                id: Date.now(), 
                examId: currentExam.value.id, 
                studentName: displayIdentity, 
                submittedAt: new Date().toLocaleString('vi-VN'), 
                type: 'essay', 
                cheats: cheatWarnings.value, 
                fileData: studentFile.value, 
                score: 0, 
                status: 'pending' 
            };
        }

        // 7. Lưu vào Supabase
        const { error } = await supabaseClient.from('results').insert([resData]);
        if (error) throw error;

        // Cập nhật giao diện giáo viên/học sinh
        allResults.value.unshift(resData); 
        showNotify(cheatWarnings.value >= 3 ? "Tự động thu bài do vi phạm!" : "Nộp bài thành công!");
        
        // 8. Dọn dẹp an toàn: Xóa CẢ 2 bản nháp local
        localStorage.removeItem(`eduexam_backup_${currentExam.value.id}`);
        localStorage.removeItem(`eduexam_backup_exam_${currentExam.value.id}`);
        
        // 9. Chạy chấm bài nền bằng AI nếu có tự luận
        if (currentExam.value.type === 'quiz' && resData.status === 'pending') {
            backgroundAIGrading(resData, currentExam.value); 
        }

    } catch (err) {
        console.error("Lỗi hệ thống khi nộp bài:", err);
        view.value = previousView; 
        showNotify("Lỗi nộp bài: " + err.message, "error");
    } finally {
        isAIGradingSubmission.value = false;
        isConfirmingSubmit.value = false; // Reset trạng thái xác nhận
    }
};
// Thêm hàm cuộn tới câu hỏi (Helper function)
const scrollToQuestion = (idx) => {
    const el = document.getElementById('question-' + idx);
    if (el) {
        // Tính toán khoảng cách offset để không bị dính sát mép trên
        const offset = 100; 
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = el.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
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

const subscribeToExamChanges = async () => {
    // 1. Nếu không có user thì không kết nối
    if (!currentUser.value) return;

    // 2. CỰC KỲ QUAN TRỌNG: Nếu đã có kênh cũ, phải xóa hẳn trước khi tạo mới
    if (realtimeChannel) {
        console.log("♻️ Đang làm mới kênh Realtime...");
        await supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    console.log("🚀 Khởi tạo hệ thống đồng bộ Realtime...");

    try {
        // 3. Định nghĩa kênh TRƯỚC, rồi mới gắn .on, cuối cùng mới .subscribe()
        const channel = supabaseClient.channel('exams-monitor-channel');
        
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'exams' },
            (payload) => {
                console.log('📡 CSDL thay đổi:', payload);
                if (payload.eventType === 'INSERT') {
                    const isExisted = exams.value.some(e => e.id === payload.new.id);
                    if (!isExisted) exams.value.push(payload.new);
                } 
                else if (payload.eventType === 'UPDATE') {
                    const index = exams.value.findIndex(e => e.id === payload.new.id);
                    if (index !== -1) exams.value[index] = payload.new;
                } 
                else if (payload.eventType === 'DELETE') {
                    exams.value = exams.value.filter(e => e.id !== payload.old.id);
                }
            }
        );

        // Lưu instance vào biến toàn cục để quản lý
        realtimeChannel = channel.subscribe((status) => {
            console.log("📡 Trạng thái kết nối:", status);
            if (status === 'CHANNEL_ERROR') {
                realtimeChannel = null;
                setTimeout(() => subscribeToExamChanges(), 5000);
            }
        });

    } catch (err) {
        realtimeChannel = null;
        console.error("Lỗi khởi tạo Realtime:", err.message);
    }
};
// --- KHAI BÁO STATE MỚI ---
const showInfoModal = ref(false); // Trạng thái hiện/ẩn modal nhập thông tin
const selectedExamForInfo = ref(null); // Lưu tạm đề thi trước khi nhấn xác nhận
const studentProfile = ref({
    fullName: '',
    className: '',
    school: 'THPT Yersin Đà Lạt' // Có thể để mặc định tên trường của mình
});

// --- FULL HÀM START EXAM (Mở Modal) ---
const startExam = (exam) => {
    // 1. Lưu đề thi lại để xử lý sau khi nhập thông tin
    selectedExamForInfo.value = exam;
    
    // 2. Mở modal yêu cầu nhập Họ tên, Lớp, Trường
    showInfoModal.value = true;
};

const confirmStartExam = async () => {
    const exam = selectedExamForInfo.value;
    if (!exam) return;

    // 1. Kiểm tra thông tin định danh học sinh
    if (!studentProfile.value.fullName.trim() || !studentProfile.value.className.trim()) {
        showNotify("Vui lòng điền đầy đủ Họ tên và Lớp để giáo viên chấm điểm!", "error");
        return;
    }

    // 2. KIỂM TRA GIỚI HẠN SỐ LƯỢT LÀM BÀI (Tránh spam rác CSDL)
    const attemptLimit = exam.settings?.attemptLimit || 0;
    if (attemptLimit > 0) {
        // Chuẩn hóa chuỗi định danh học sinh (Họ tên - Lớp) để kiểm tra
        const displayIdentity = `${studentProfile.value.fullName.trim()} - Lớp: ${studentProfile.value.className.trim()}`;
        
        // Đếm số lượt đã nộp trong danh sách kết quả (allResults)
        const previousAttempts = allResults.value.filter(r => 
            r.examId === exam.id && 
            r.studentName.toLowerCase() === displayIdentity.toLowerCase()
        ).length;
        
        if (previousAttempts >= attemptLimit) {
            showNotify(`Bạn đã hết lượt làm bài! (Đã nộp ${previousAttempts}/${attemptLimit} lượt)`, "error");
            return; // Chặn đứng, không cho phép vào phòng thi
        }
    }

    // 3. Kiểm tra mật khẩu phòng thi (nếu giáo viên có cài đặt)
    if (exam.settings?.password) {
        const p = prompt("Vui lòng nhập mật khẩu phòng thi:");
        if (p !== exam.settings.password) return showNotify("Mật khẩu không chính xác!", "error");
    }

// 4. Kích hoạt chế độ toàn màn hình an toàn
    enterFullScreen();
    isExamStarting.value = true; 

    // --- BỔ SUNG ĐOẠN DỌN DẸP NÀY VÀO ---
    if (examRoomChannel) {
        supabaseClient.removeChannel(examRoomChannel);
        examRoomChannel = null;
    }

    // 5. Khởi tạo cấu trúc dữ liệu đề thi bài làm
    let examCopy = JSON.parse(JSON.stringify(exam));

    // Kiểm tra xem có bản sao lưu cục bộ (lỡ tay load lại trang hoặc rớt mạng) hay không
    const backupAns = localStorage.getItem(`eduexam_backup_${exam.id}`);
    const backupExam = localStorage.getItem(`eduexam_backup_exam_${exam.id}`);

    let shouldRestore = false;
    if (backupAns && backupExam) {
        shouldRestore = confirm("Hệ thống tìm thấy bài làm dở trước đó của bạn. Bạn có muốn khôi phục lại không?");
    }

    if (shouldRestore) {
        // Trường hợp khôi phục bài làm: Lấy nguyên trạng đề đã xáo và đáp án cũ từ máy học sinh
        examCopy = JSON.parse(backupExam);
        studentAnswers.value = JSON.parse(backupAns);
    } else {
        // Trường hợp làm bài mới hoàn toàn: Tiến hành đảo đề nếu bật ShuffleMode
        if (examCopy.settings?.shuffleMode) {
            
            // Bước 5.1: Gắn chỉ số vị trí câu hỏi gốc và tiến hành đảo đáp án trắc nghiệm (A, B, C, D)
            examCopy.questions.forEach((q, originalQIdx) => {
                q.originalQIdx = originalQIdx; // ID gốc dùng để map log kết quả khi nộp bài
                
                if (q.type === 'mc') {
                    // Tạo mảng phương án kèm index gốc để truy vết
                    let optionsWithIndices = q.options.map((text, idx) => ({
                        text: text,
                        originalIdx: idx,
                        isCorrect: idx === q.correct
                    }));
                    
                    optionsWithIndices = shuffleArray(optionsWithIndices); // Đảo thứ tự đáp án câu này
                    
                    q.options = optionsWithIndices.map(o => o.text);
                    q.correct = optionsWithIndices.findIndex(o => o.isCorrect); // Cập nhật vị trí đáp án đúng mới
                    q.originalOptionMap = optionsWithIndices.map(o => o.originalIdx); // Bản đồ giải mã khi nộp bài
                }
            });

            // Bước 5.2: Phân tách câu hỏi ra 3 nhóm riêng biệt để cố định cấu trúc phần thi
            const mcQuestions = examCopy.questions.filter(q => q.type === 'mc');
            const tfQuestions = examCopy.questions.filter(q => q.type === 'tf');
            const saQuestions = examCopy.questions.filter(q => q.type === 'sa' || q.type === 'essay');

            // Bước 5.3: Xáo trộn câu hỏi nội bộ trong từng phần (Không để lộn xộn các phần với nhau)
            const shuffledMC = shuffleArray(mcQuestions);
            const shuffledTF = shuffleArray(tfQuestions);
            const shuffledSA = shuffleArray(saQuestions);

            // Bước 5.4: Gộp lại theo thứ tự chuẩn hóa của Bộ GD: Phần I -> Phần II -> Phần III
            examCopy.questions = [...shuffledMC, ...shuffledTF, ...shuffledSA];

        } else {
            // Nếu giáo viên không bật Đảo đề: Chỉ gắn ID gốc để hệ thống chạy ổn định
            examCopy.questions.forEach((q, idx) => { q.originalQIdx = idx; });
        }

        // Tạo mảng phản ứng trống để lưu trữ câu trả lời của học sinh theo đề thi hiện tại
        studentAnswers.value = examCopy.questions.map(q => ({
            originalQIdx: q.originalQIdx,
            originalOptionMap: q.originalOptionMap,
            choice: q.type === 'tf' ? [null, null, null, null] : null,
            text: '',
            fileData: null
        }));
        
        // Lưu trữ ngay bộ đề vừa tạo bản xáo vào máy học sinh để phòng hờ sự cố reload
        localStorage.setItem(`eduexam_backup_exam_${exam.id}`, JSON.stringify(examCopy));
        
        // LƯU THÊM HỒ SƠ HỌC SINH ĐỂ RADAR CÓ THỂ ĐỌC ĐƯỢC NẾU GIÁO VIÊN HOẶC HỌC SINH BẤM F5
        localStorage.setItem('eduexam_student_profile', JSON.stringify(studentProfile.value));
    }

    // 6. Cài đặt các thông số phòng thi và chuyển màn hình
    currentExam.value = examCopy;
    timeLeft.value = examCopy.time * 60;
    cheatWarnings.value = 0;
    showInfoModal.value = false;
    view.value = 'exam-room';

    // 7. Sau 1 giây phòng thi ổn định, tắt cờ bắt đầu và kích hoạt ép kiểm tra giám sát
    setTimeout(() => {
        isExamStarting.value = false; 
        handleFullscreenChange(); // Đồng bộ trạng thái màn hình hiện tại
        sendRealtimeUpdate(); // KÍCH HOẠT RADAR: Báo cáo có mặt ngay lập tức!
    }, 1000); 

    // 8. Kích hoạt bộ đếm ngược thời gian phòng thi (1 giây chạy 1 lần)
    if (timerInterval.value) clearInterval(timerInterval.value);
    timerInterval.value = setInterval(() => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
        } else {
            submitExam(false); // Hết giờ, hệ thống tự động khóa và thu bài
        }
    }, 1000);
};
// 1. Khai báo các ref mới
const showAddModal = ref(false);
const newUserData = ref({ name: '', password: '', role: 'teacher' });

// 2. Hàm mở modal
const openAddModal = () => { 
    newUserData.value = { name: '', password: '', role: 'teacher' }; 
    showAddModal.value = true; 
};

// 3. Hàm lưu người dùng (Đã sửa để lấy đúng role từ form)
const saveNewUser = async () => {
    if (!newUserData.value.name.trim() || !newUserData.value.password.trim()) {
        return showNotify("Nhập đầy đủ thông tin", "error");
    }
    
    const newUser = { 
        id: Date.now(), 
        name: newUserData.value.name,
        password: newUserData.value.password,
        role: newUserData.value.role // Lấy role từ form đã chọn
    };

    const { error } = await supabaseClient.from('users').insert([newUser]);
    if (!error) { 
        users.value.push(newUser); 
        showAddModal.value = false; 
        showNotify(`Đã tạo tài khoản ${newUser.role} thành công!`); 
    } else {
        showNotify("Lỗi: " + error.message, "error");
    }
};
const exportToExcel = () => {
    if (!currentExam.value || filteredResults.value.length === 0) {
        return showNotify("Không có dữ liệu để xuất file!", "error");
    }

    // Tiêu đề cột
    let csvContent = "\uFEFF"; // BOM để hiển thị đúng tiếng Việt
    csvContent += "Họ và tên,Thời gian nộp,Số lần vi phạm,Trạng thái,Điểm số\n";

    // Duyệt qua danh sách kết quả đã lọc
    filteredResults.value.forEach(res => {
        const row = [
            `"${res.studentName}"`,
            `"${res.submittedAt}"`,
            `"${res.cheats}"`,
            `"${res.status === 'graded' ? 'Đã chấm' : 'Chờ chấm'}"`,
            `"${res.score}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    // Tạo liên kết tải về
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Ket_qua_${currentExam.value.title.replace(/\s/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotify("Đã xuất danh sách kết quả ra file Excel!");
};
// --- STATE MỚI CHO CHỨC NĂNG IN ---
const showPrintModal = ref(false);
const printData = ref(null); // Lưu trữ bản sao kết quả để chỉnh sửa trước khi in
// --- STATE CHO LỊCH SỬ LÀM BÀI ---
const showHistoryModal = ref(false);
const studentHistory = ref([]);
const historyStudentName = ref('');

const openStudentHistory = (studentName, examId) => {
    historyStudentName.value = studentName;
    // Lọc lấy toàn bộ các lần nộp bài của học sinh này trong đề thi hiện tại
    studentHistory.value = allResults.value
        .filter(r => r.examId === examId && r.studentName === studentName)
        .sort((a, b) => b.id - a.id); // Sắp xếp mới nhất lên đầu
    
    showHistoryModal.value = true;
};
// Hàm mở modal in và chuẩn bị dữ liệu
const openPrintPreview = (result) => {
    const exam = exams.value.find(e => e.id === result.examId);
    // Tạo bản sao sâu để chỉnh sửa không ảnh hưởng đến Database
    printData.value = {
        ...JSON.parse(JSON.stringify(result)),
        examTitle: exam?.title || 'BÀI KIỂM TRA',
        questions: exam?.questions || []
    };
    showPrintModal.value = true;
};

// Hàm xuất PDF từ HTML
const exportToPDF = () => {
    const element = document.getElementById('printable-sheet');
    const opt = {
        margin: 0,
        filename: `Phieu_Ket_Qua_${printData.value.studentName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};
// Thêm vào cùng nhóm với các ref khác như users, exams...

// Hàm chọn/bỏ chọn tất cả checkbox
const toggleSelectAll = (event) => {
    if (event.target.checked) {
        // Chỉ chọn những user có ID (tức là đã lưu trong DB, không phải FIXED_ACCOUNTS)
        selectedUsers.value = filteredUsers.value
            .filter(u => u.id && u.name !== 'admin')
            .map(u => u.id);
    } else {
        selectedUsers.value = [];
    }
};

// Hàm thực hiện xóa hàng loạt
const confirmBulkDelete = async () => {
    if (selectedUsers.value.length === 0) return;

    try {
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .in('id', selectedUsers.value);

        if (!error) {
            // Cập nhật lại danh sách hiển thị
            users.value = users.value.filter(u => !selectedUsers.value.includes(u.id));
            showNotify(`Đã xóa thành công ${selectedUsers.value.length} tài khoản.`);
            selectedUsers.value = []; // Reset danh sách chọn
            showBulkDeleteConfirm.value = false;
        } else {
            showNotify("Lỗi xóa hàng loạt: " + error.message, "error");
        }
    } catch (err) {
        showNotify("Lỗi kết nối hệ thống", "error");
    }
};
const sendRealtimeUpdate = async () => {
    if (view.value !== 'exam-room' || !currentExam.value) return;

    // Tính toán tiến độ
    let doneCount = 0;
    studentAnswers.value.forEach(ans => {
        if (ans.choice !== null && !Array.isArray(ans.choice)) doneCount++;
        else if (Array.isArray(ans.choice) && ans.choice.some(c => c !== null)) doneCount++;
        else if ((ans.text && ans.text.trim() !== '') || ans.fileData) doneCount++;
    });

    const statePayload = {
        studentName: `${studentProfile.value.fullName} - Lớp: ${studentProfile.value.className}`,
        progress: doneCount,
        total: currentExam.value.questions.length,
        cheats: cheatWarnings.value,
        lastUpdate: new Date().toLocaleTimeString('vi-VN')
    };

    // Đảm bảo kênh đã kết nối
    const channelName = `exam-room-${String(currentExam.value.id)}`;
    
    // Nếu chưa có kênh thì subscribe, nếu có rồi thì cứ gửi
    if (!examRoomChannel || examRoomChannel.topic !== channelName) {
        examRoomChannel = supabaseClient.channel(channelName);
        await examRoomChannel.subscribe();
    }

    // Gửi Broadcast đi
    examRoomChannel.send({
        type: 'broadcast',
        event: 'progress',
        payload: statePayload
    });
    
    // Track thêm presence để báo Online
    examRoomChannel.track(statePayload);
};

const openLiveMonitor = (exam) => {
    teacherTab.value = 'monitor';
    currentExam.value = exam; 
    localStorage.setItem('eduexam_monitor_exam_id', exam.id);
    liveMonitors.value = []; // Reset danh sách
    
    if (examRoomChannel) supabaseClient.removeChannel(examRoomChannel);

    const channelName = `exam-room-${String(exam.id)}`;
    examRoomChannel = supabaseClient.channel(channelName);
    
    // 1. Lắng nghe Broadcast (Tiến độ bài làm)
    examRoomChannel.on('broadcast', { event: 'progress' }, ({ payload }) => {
        // CÁCH NÀY ĐẢM BẢO VUE NHẬN DIỆN THAY ĐỔI 100%
        const currentList = [...liveMonitors.value]; // Copy danh sách cũ
        const idx = currentList.findIndex(s => s.studentName === payload.studentName);
        
        if (idx !== -1) {
            currentList[idx] = payload; // Cập nhật phần tử
        } else {
            currentList.push(payload); // Thêm mới
        }
        
        // Gán lại mảng mới -> Vue sẽ cập nhật giao diện ngay lập tức
        liveMonitors.value = currentList;
        console.log("🔥 Đã nhận và cập nhật tiến độ cho:", payload.studentName, payload.progress);
    });

    // 2. Lắng nghe Presence (Để biết ai đang Online)
    examRoomChannel.on('presence', { event: 'sync' }, () => {
        const state = examRoomChannel.presenceState();
        const activeStudents = [];
        for (const key in state) {
            if (key !== 'teacher') activeStudents.push(state[key][0]);
        }
        // Đồng bộ danh sách online (chỉ cập nhật nếu chưa có thông tin tiến độ)
        liveMonitors.value = [...activeStudents]; 
    });

    examRoomChannel.subscribe();
};
return {
    liveMonitors,
    openLiveMonitor,
    selectedSubjectFilter,
    uniqueSubjects,
    searchResultQuery,
    showHistoryModal,
    studentHistory,
    historyStudentName,
    openStudentHistory,
    deleteResult,
    sendRealtimeUpdate,
    showMobileQuestionMap,
    isConfirmingSubmit,
    getTfScore,
    getOffset,
    itemsPerPage,
    searchUserQuery,
    totalPages,
    paginatedUsers,
    currentPage,
    filterRole,
    confirmBulkDelete,
    toggleSelectAll,
    showBulkDeleteConfirm,
    selectedUsers,
    showDeleteConfirm, // PHẢI THÊM DÒNG NÀY
    userToDelete,      // PHẢI THÊM DÒNG NÀY
    confirmDeleteUser,
    exportToPDF,
    openPrintPreview,
    printData,
    showPrintModal,
    exportToExcel,
    showFullscreenOverlay,
    cheatMessage,
    enterFullScreen,
    showAddModal,
    newUserData,
    saveNewUser,
    showInfoModal,
    studentProfile,
    confirmStartExam,
    selectedExamForInfo,
    searchExam,
    filteredExams,
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
            showEditModal,
            editUserData,
            openEditModal, 
            saveUserEdit, 
            openAddModal, 

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