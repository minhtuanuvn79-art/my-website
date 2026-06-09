const { createApp, ref, computed, onMounted, watch } = Vue;

const supabaseUrl = 'https://dtfdzuggnitsdnlutryn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmR6dWdnbml0c2RubHV0cnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mjk0NTAsImV4cCI6MjA5MDUwNTQ1MH0.9Ne1ONIO9-ASkThtFZJLxV42dbyIMGkHwweIjTZ5A6Q';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let realtimeChannel = null;
let examRoomChannel = null;
const app = createApp({   
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
        // --- NGÂN HÀNG CÂU HỎI VÀ MA TRẬN ĐỀ TỰ ĐỘNG ---
const showMatrixGenerator = ref(false);
const matrixSettings = ref({ subject: '', mc: 10, tf: 0, sa: 0 });

// Tự động quét và gom toàn bộ câu hỏi từ các đề thi cũ tạo thành "Ngân hàng chung"
const globalQuestionBank = computed(() => {
    let allQs = [];
    exams.value.forEach(exam => {
        if (exam.questions && Array.isArray(exam.questions)) {
            exam.questions.forEach(q => {
                allQs.push({ 
                    ...q, 
                    sourceSubject: exam.subject || 'Chưa phân loại',
                    sourceGrade: exam.grade || 'Chưa phân loại' // Lưu thêm khối
                });
            });
        }
    });
    return allQs;
});

const generateFromBank = () => {
    // 1. Kiểm tra điều kiện đầu vào
    if (!matrixSettings.value.subject || !matrixSettings.value.grade) {
        return showNotify("Vui lòng chọn đầy đủ Môn học và Khối lớp!", "error");
    }

    // 2. Lọc câu hỏi từ "kho ảo" dựa trên Môn và Khối
    const pool = globalQuestionBank.value.filter(q => 
        q.sourceSubject === matrixSettings.value.subject && 
        q.sourceGrade === matrixSettings.value.grade
    );
    
    // 3. Tách thành các nhóm theo loại và xáo trộn ngẫu nhiên
    const mcPool = shuffleArray(pool.filter(q => q.type === 'mc'));
    const tfPool = shuffleArray(pool.filter(q => q.type === 'tf'));
    const saPool = shuffleArray(pool.filter(q => q.type === 'sa' || q.type === 'essay'));

    // 4. Kiểm tra số lượng tồn kho
    if (mcPool.length < matrixSettings.value.mc || 
        tfPool.length < matrixSettings.value.tf || 
        saPool.length < matrixSettings.value.sa) {
        return showNotify(`Kho không đủ! Môn ${matrixSettings.value.subject} khối ${matrixSettings.value.grade} hiện có: ${mcPool.length} trắc nghiệm, ${tfPool.length} Đúng/Sai, ${saPool.length} Tự luận.`, "error");
    }

    // 5. Bốc đề theo ma trận
    const selectedMC = mcPool.slice(0, matrixSettings.value.mc);
    const selectedTF = tfPool.slice(0, matrixSettings.value.tf);
    const selectedSA = saPool.slice(0, matrixSettings.value.sa);

    // 6. Nối vào đề thi hiện tại
    // Lưu ý: Đảm bảo newExam.value.questions là một mảng
    if (!newExam.value.questions) newExam.value.questions = [];
    
    newExam.value.questions = [
        ...newExam.value.questions, 
        ...selectedMC, 
        ...selectedTF, 
        ...selectedSA
    ];
    
    // 7. Đóng modal và thông báo thành công
    showMatrixGenerator.value = false;
    showNotify(`Đã bốc thành công ${selectedMC.length + selectedTF.length + selectedSA.length} câu vào đề thi!`, "success");
};
// --- THƯ VIỆN ĐỀ THI CHUNG (CHỢ ĐỀ THI) ---
const publicExams = computed(() => {
    // Lọc các đề được Public VÀ KHÔNG PHẢI do chính mình tạo ra
    return exams.value.filter(e => 
        e.settings?.isPublic === true && 
        e.creator !== currentUser.value?.name
    );
});

const cloneExam = async (examTemplate) => {
    if(!confirm(`Bạn muốn sao chép đề "${examTemplate.title}" của giáo viên ${examTemplate.creator} về kho của mình?`)) return;

    // 1. Tạo bản sao độc lập
    const clonedExam = JSON.parse(JSON.stringify(examTemplate));
    
    // 2. Làm mới các thông số nhận diện
    clonedExam.id = Date.now(); // Cấp ID mới
    clonedExam.creator = currentUser.value.name; // Đổi chủ sở hữu thành người đang copy
    clonedExam.examCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // Mã phòng thi mới
    
    // 3. Reset cài đặt về riêng tư và chưa giao bài
    if(!clonedExam.settings) clonedExam.settings = {};
    clonedExam.settings.isPublic = false; 
    clonedExam.settings.isPublished = false;
    clonedExam.settings.folderId = null; // Trả về màn hình chính, không cất trong thư mục

    // 4. Lưu lên Database
    const { error } = await supabaseClient.from('exams').insert([clonedExam]);
    
    if (!error) {
        exams.value.unshift(clonedExam);
        showNotify("Đã sao chép đề thi thành công vào kho của bạn!");
        teacherTab.value = 'exams'; // Tự động chuyển về kho cá nhân để xem đề vừa copy
    } else {
        showNotify("Lỗi sao chép: " + error.message, "error");
    }
};
        const cheatMessage = ref('');

const searchExam = ref('');
const searchResultQuery = ref(''); // Biến lưu từ khóa tìm kiếm học sinh
const filteredExams = computed(() => {
    // 1. CHỈ HIỆN ĐỀ CỦA CHÍNH MÌNH TẠO RA & ĐỀ BÊN NGOÀI (Lọc bỏ các đề đã cất vào Kho lưu trữ)
    let result = exams.value.filter(exam => 
        exam.creator === currentUser.value?.name && !exam.settings?.folderId
    );

    // 2. Lọc theo từ khóa (Tìm tên đề thi trên thanh tìm kiếm)
    if (searchExam.value.trim()) {
        const term = searchExam.value.toLowerCase().trim();
        result = result.filter(exam => exam.title.toLowerCase().includes(term));
    }

    // 3. Lọc theo Môn học (Nếu có chọn từ Dropdown)
    if (selectedSubjectFilter.value) {
        result = result.filter(exam => exam.subject === selectedSubjectFilter.value);
    }

    return result;
});
// --- LỌC ĐỀ THI CHO HỌC SINH ---
const visibleExamsForStudent = computed(() => {
    return exams.value.filter(exam => {
        // 1. Không hiển thị các đề đang bị cất trong Kho lưu trữ
        if (exam.settings?.folderId) return false;
        
        // 2. Chỉ hiển thị đề đã được giáo viên bấm "Giao bài" (isPublished = true)
        if (!exam.settings?.isPublished) return false;
        
        // 3. Nếu có cài đặt Hẹn giờ mở đề, kiểm tra xem đã đến giờ chưa
        if (exam.settings?.scheduledAt && new Date() < new Date(exam.settings.scheduledAt)) {
            return false;
        }
        
        // 4. Nếu có cài đặt Hạn chót (Khóa đề), ẩn đề đi nếu đã quá hạn
        if (exam.settings?.closedAt && new Date() >= new Date(exam.settings.closedAt)) {
            return false;
        }
        
        return true;
    });
});
// --- STATE PHÂN TRANG KHO ĐỀ ---
const currentExamPage = ref(1);
const examsPerPage = 6; // Số đề mỗi trang

// Tính tổng số trang
const totalExamPages = computed(() => {
    return Math.ceil(filteredExams.value.length / examsPerPage) || 1;
});

// Lấy danh sách đề thi theo trang hiện tại
const paginatedExams = computed(() => {
    const start = (currentExamPage.value - 1) * examsPerPage;
    const end = start + examsPerPage;
    return filteredExams.value.slice(start, end);
});

// Tự động quay về trang 1 nếu người dùng gõ tìm kiếm hoặc lọc môn học
watch([searchExam, selectedSubjectFilter], () => {
    currentExamPage.value = 1;
});
const showDetailedAnswers = ref(false); // Biến ẩn/hiện đáp án chi tiết
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
    closedAt: null,
    isPublic: false,
    scoreThreshold: 0
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
// --- KHO LƯU TRỮ & CHUỘT PHẢI (ĐÃ ĐỒNG BỘ SUPABASE) ---
const folders = ref([]); 

const showFolderModal = ref(false);
const newFolderName = ref('');
const activeFolderId = ref(null); // Thư mục đang mở

// Trạng thái của Menu Chuột phải
const contextMenu = ref({ show: false, x: 0, y: 0, exam: null });
const showMoveModal = ref(false);

// Hàm mở/đóng menu chuột phải
const openContextMenu = (event, exam) => {
    contextMenu.value = {
        show: true,
        x: event.clientX,
        y: event.clientY,
        exam: exam
    };
};
const closeContextMenu = () => { contextMenu.value.show = false; };

// Lắng nghe click chuột trái ra ngoài để tự động đóng menu chuột phải
onMounted(() => { document.addEventListener('click', closeContextMenu); });

// Hàm xử lý thư mục (Lưu lên Database)
const createFolder = async () => {
    if (!newFolderName.value.trim()) return showNotify("Vui lòng nhập tên thư mục!", "error");
    
const newFolder = { 
    name: newFolderName.value.trim(),
    creator: currentUser.value?.name
};

// Thêm .select() để lấy Folder kèm ID tự tăng
const { data, error } = await supabaseClient.from('folders').insert([newFolder]).select();

if (!error && data) {
    folders.value.push(data[0]); // Cập nhật bản ghi có ID chuẩn vào UI
    newFolderName.value = '';
    showFolderModal.value = false;
    showNotify("Đã tạo thư mục mới trên CSDL!");
} else {
    showNotify("Lỗi CSDL: " + error.message, "error");
}
};
// TỰ ĐỘNG LỌC: Chỉ hiển thị các thư mục do chính tài khoản này tạo ra
const filteredFolders = computed(() => {
    return folders.value.filter(f => f.creator === currentUser.value?.name);
});
// Hàm xóa thư mục (Xóa trên Database)
const deleteFolder = async (id) => {
    if(confirm("Xóa thư mục này? Các đề bên trong sẽ được trả về màn hình chính.")) {
        
        // Gọi lệnh xóa trên Supabase
        const { error } = await supabaseClient.from('folders').delete().eq('id', id);
        
        if (!error) {
            // Trả các đề thi trong thư mục này ra ngoài UI & Database
            exams.value.forEach(async (e) => {
                if (e.settings?.folderId === id) await moveExamToFolder(e, null);
            });
            
            // Xóa ở UI
            folders.value = folders.value.filter(f => f.id !== id);
            activeFolderId.value = null;
            showNotify("Đã xóa thư mục vĩnh viễn!");
        } else {
            showNotify("Lỗi xóa thư mục: " + error.message, "error");
        }
    }
};

// Hàm di chuyển đề thi vào/ra khỏi thư mục
const moveExamToFolder = async (exam, folderId) => {
    const updatedSettings = { ...(exam.settings || {}), folderId: folderId };
    
    // Cập nhật lên Supabase
    const { error } = await supabaseClient.from('exams').update({ settings: updatedSettings }).eq('id', exam.id);
    if (!error) {
        // Cập nhật UI
        const idx = exams.value.findIndex(e => e.id === exam.id);
        if (idx !== -1) exams.value[idx].settings = updatedSettings;
        
        showNotify(folderId ? "Đã cất đề thi vào Kho lưu trữ!" : "Đã đưa đề thi ra ngoài Quản lý!");
        showMoveModal.value = false;
    } else {
        showNotify("Lỗi di chuyển: " + error.message, "error");
    }
};

// --- STATE TÌM KIẾM & PHÂN TRANG KHO LƯU TRỮ ---
const searchArchiveQuery = ref('');
const currentArchivePage = ref(1);
const archiveExamsPerPage = 4; // Số lượng đề hiển thị trên mỗi trang trong kho

// Lọc và Tìm kiếm đề thi nằm TRONG thư mục đang mở
const archivedExams = computed(() => {
    if (!activeFolderId.value) return [];
    
    // 1. Lọc theo thư mục
    let result = exams.value.filter(e => 
        e.settings?.folderId === activeFolderId.value && 
        e.creator === currentUser.value?.name
    );

    // 2. Lọc theo từ khóa tìm kiếm (Nếu có)
    if (searchArchiveQuery.value.trim()) {
        const term = searchArchiveQuery.value.toLowerCase().trim();
        result = result.filter(exam => exam.title.toLowerCase().includes(term));
    }

    return result;
});

// Tính tổng số trang trong kho
const totalArchivePages = computed(() => {
    return Math.ceil(archivedExams.value.length / archiveExamsPerPage) || 1;
});

// Cắt mảng dữ liệu để hiển thị theo trang
const paginatedArchivedExams = computed(() => {
    const start = (currentArchivePage.value - 1) * archiveExamsPerPage;
    const end = start + archiveExamsPerPage;
    return archivedExams.value.slice(start, end);
});

// Tự động reset về trang 1 khi đổi thư mục hoặc gõ tìm kiếm
watch([activeFolderId, searchArchiveQuery], () => {
    currentArchivePage.value = 1;
});
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
        
        // NGĂN CHẶN PHẠT KHI ĐANG HỎI XÁC NHẬN NỘP BÀI
        if (isConfirmingSubmit.value) return; 

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
            
            // NGĂN CHẶN PHẠT KHI ĐANG HỎI XÁC NHẬN NỘP BÀI HOẶC BẤM HỦY
            if (isConfirmingSubmit.value) return; 

            // NẾU LÀ ĐIỆN THOẠI -> KHÔNG PHẠT LỖI FULLSCREEN NỮA!
            if (isMobile) {
                return; 
            }

            setTimeout(() => {
                const reCheckFull = !!(document.fullscreenElement || 
                                     document.webkitFullscreenElement || 
                                     document.mozFullScreenElement || 
                                     document.msFullscreenElement);
                
                // KIỂM TRA LẠI LẦN NỮA TRONG SETTIMEOUT CHO CHẮC CHẮN
                if (!reCheckFull && !isConfirmingSubmit.value) {
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

        // TẢI THƯ MỤC TỪ SUPABASE
        const { data: folderData } = await supabaseClient.from('folders').select('*');
        if (folderData) folders.value = folderData;

        // TẢI NGƯỜI DÙNG: Chỉ lấy từ Database
        const { data: userData } = await supabaseClient.from('users').select('*');
        if (userData) {
            users.value = userData; 
        }
        
        console.log("✅ Dữ liệu đã đồng bộ hoàn toàn từ Cloud Supabase");
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
            
            // Khôi phục phiên đăng nhập cũ nếu có
            const savedUser = localStorage.getItem('eduexam_user');
            if (savedUser) {
                currentUser.value = JSON.parse(savedUser);
                subscribeToExamChanges();
            }

            // ====================================================
            // TÍNH NĂNG MỚI: TỰ ĐỘNG BẮT LINK VÀ VÀO THI KHÔNG CẦN ĐĂNG NHẬP
            // ====================================================
            const urlParams = new URLSearchParams(window.location.search);
            const codeFromUrl = urlParams.get('examCode');

            if (codeFromUrl) {
                // 1. Nếu HS chưa có tài khoản, tự động cấp danh tính "Vãng lai" để lướt qua màn hình Đăng Nhập
                if (!currentUser.value) {
                    currentUser.value = { id: Date.now(), name: 'Thí sinh (Vãng lai)', role: 'student' };
                }
                
                // 2. Ép chuyển sang giao diện của Học sinh
                if (currentUser.value.role !== 'admin' && currentUser.value.role !== 'teacher') {
                    view.value = 'student-dash';
                }

                // 3. Tìm đề thi tương ứng với mã Code trên URL
                const targetExam = exams.value.find(e => e.examCode === codeFromUrl.toUpperCase());
                if (targetExam) {
                    // Chờ giao diện render xong (300ms) rồi tự động bung bảng nhập Tên - Lớp
                    setTimeout(() => {
                        startExam(targetExam);
                    }, 300);
                } else {
                    showNotify("Đề thi không tồn tại hoặc đã bị khóa!", "error");
                }
                
                // 4. Dọn dẹp URL trên thanh địa chỉ cho sạch sẽ (Xóa bỏ ?examCode=...)
                window.history.replaceState({}, document.title, window.location.pathname);
            } 
            // ====================================================
            // TỰ ĐỘNG KHÔI PHỤC RADAR CHO GIÁO VIÊN NẾU BẤM F5 (Giữ nguyên)
            // ====================================================
            else if (currentUser.value && (currentUser.value.role === 'teacher' || currentUser.value.role === 'admin') && teacherTab.value === 'monitor') {
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
    
    // Kiểm tra nhanh trên Frontend
    if (users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase())) 
        return showNotify("Tên người dùng đã tồn tại", "error");

    const newUser = { name: authForm.value.name, password: authForm.value.password, role: 'student' };

    const { data, error } = await supabaseClient.from('users').insert([newUser]).select();

    if (!error && data) { 
        users.value.push(data[0]); 
        showNotify("Đăng ký thành công!"); 
        switchView('login'); 
    } else {
        // Bắt lỗi trùng lặp từ Database và hiển thị UI thân thiện
        if (error.code === '23505' || error.message.includes('unique constraint')) {
            showNotify("Tên tài khoản này đã có người sử dụng, vui lòng chọn tên khác!", "error");
        } else {
            showNotify("Lỗi CSDL: " + error.message, "error");
        }
    }
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
const getOffset = (type, pData) => {
    if (!pData || !pData.questions) return 0;
    if (type === 'mc') return pData.questions.filter(q => q.type === 'mc').length;
    return 0;
};

const getTfScore = (idx, q, pData) => {
    const studentAns = pData.studentAnswersLog[idx + getOffset('mc', pData)];
    if (!studentAns || !studentAns.choice) return 0;
    
    let match = 0;
    for (let i = 0; i < 4; i++) {
        if (studentAns.choice[i] === q.correct[i]) match++;
    }
    const scale = currentExam.value?.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0]; 
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
        // 1. Lấy tên cũ của tài khoản trước khi cập nhật
        const oldUser = users.value.find(u => u.id === editUserData.value.id);
        const oldName = oldUser ? oldUser.name : '';
        const newName = editUserData.value.name;

        // 2. Cập nhật thông tin tài khoản trên bảng 'users'
        const { error } = await supabaseClient
            .from('users')
            .update({ 
                name: newName, 
                password: editUserData.value.password, 
                role: editUserData.value.role 
            })
            .eq('id', editUserData.value.id);

        if (!error) {
            // 3. ĐỒNG BỘ ĐỔI TÊN: Nếu tên bị thay đổi, tự động đổi tên creator trong đề thi và thư mục
            if (oldName && oldName !== newName) {
                // Đổi tên trên Cloud Supabase
                await supabaseClient.from('exams').update({ creator: newName }).eq('creator', oldName);
                await supabaseClient.from('folders').update({ creator: newName }).eq('creator', oldName);

                // Đồng bộ cập nhật ngay trên giao diện (Local State)
                exams.value.forEach(e => {
                    if (e.creator === oldName) e.creator = newName;
                });
                folders.value.forEach(f => {
                    if (f.creator === oldName) f.creator = newName;
                });
            }

            // 4. Tìm và cập nhật lại trong mảng danh sách người dùng đang hiển thị
            const index = users.value.findIndex(u => u.id === editUserData.value.id);
            if (index !== -1) {
                users.value[index] = { ...editUserData.value };
            }
            
            showEditModal.value = false;
            showNotify("Cập nhật tài khoản và đồng bộ dữ liệu thành công!");
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
        grade: '',
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

    // Khai báo biến 1 lần duy nhất
    let error;
    let insertedData = null;

    if (isEditing) {
        error = (await supabaseClient.from('exams').update(examData).eq('id', newExam.value.id)).error;
    } else {
        // Không tự gán examData.id nữa, thêm .select() để lấy ID do Supabase cấp
        const response = await supabaseClient.from('exams').insert([examData]).select();
        error = response.error;
        if (response.data) insertedData = response.data[0];
    }

    if (!error) {
        if (isEditing) { 
            const idx = exams.value.findIndex(e => e.id === examData.id); 
            if (idx !== -1) exams.value[idx] = examData; 
            showNotify("Đã cập nhật đề thi!"); 
        } else { 
            // Đẩy đề thi đã có ID của Supabase vào mảng cục bộ
            exams.value.push(insertedData); 
            showNotify("Đã giao bài thành công! Mã Code: " + examData.examCode); 
        }
        view.value = 'teacher-dash'; teacherTab.value = 'exams';
    } else {
        showNotify("Lỗi lưu đề: " + error.message, "error");
    }
};

        const deleteExam = async (id) => {
            if(confirm("Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này không?")) {
                await supabaseClient.from('exams').delete().eq('id', id); await supabaseClient.from('results').delete().eq('examId', id);
                exams.value = exams.value.filter(e => e.id !== id); allResults.value = allResults.value.filter(r => r.examId !== id); showNotify("Đã xóa đề thi.");
            }
        };

const viewResults = (id) => { 
    currentExam.value = exams.value.find(e => e.id === id); 
    selectedResults.value = []; // Bổ sung dòng này
    view.value = 'view-results'; 
};
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
// --- STATE & HÀM XÓA HÀNG LOẠT BÀI THI ---
const selectedResults = ref([]);
const showBulkDeleteResultConfirm = ref(false);

const toggleSelectAllResults = (event) => {
    if (event.target.checked) {
        selectedResults.value = filteredResults.value.map(r => r.id);
    } else {
        selectedResults.value = [];
    }
};

const confirmBulkDeleteResults = async () => {
    if (selectedResults.value.length === 0) return;

    try {
        const { error } = await supabaseClient
            .from('results')
            .delete()
            .in('id', selectedResults.value);

        if (!error) {
            // Cập nhật lại danh sách tổng
            allResults.value = allResults.value.filter(r => !selectedResults.value.includes(r.id));
            showNotify(`Đã xóa thành công ${selectedResults.value.length} bài thi.`);
            selectedResults.value = []; // Reset danh sách chọn
            showBulkDeleteResultConfirm.value = false;
        } else {
            showNotify("Lỗi xóa hàng loạt: " + error.message, "error");
        }
    } catch (err) {
        showNotify("Lỗi kết nối hệ thống", "error");
    }
};
// --- STATE & HÀM XÓA HÀNG LOẠT ĐỀ THI ---
const selectedExams = ref([]);
const showBulkDeleteExamConfirm = ref(false);

const toggleSelectAllExams = (event) => {
    if (event.target.checked) {
        selectedExams.value = filteredExams.value.map(e => e.id);
    } else {
        selectedExams.value = [];
    }
};

const confirmBulkDeleteExams = async () => {
    if (selectedExams.value.length === 0) return;

    try {
        // Xóa toàn bộ kết quả bài làm của học sinh thuộc các đề này trước (tránh lỗi khóa ngoại CSDL)
        await supabaseClient.from('results').delete().in('examId', selectedExams.value);
        
        // Sau đó xóa các đề thi
        const { error } = await supabaseClient
            .from('exams')
            .delete()
            .in('id', selectedExams.value);

        if (!error) {
            // Cập nhật lại giao diện
            exams.value = exams.value.filter(e => !selectedExams.value.includes(e.id));
            allResults.value = allResults.value.filter(r => !selectedExams.value.includes(r.examId));
            
            showNotify(`Đã xóa vĩnh viễn ${selectedExams.value.length} đề thi và các kết quả liên quan.`);
            selectedExams.value = []; 
            showBulkDeleteExamConfirm.value = false;
        } else {
            showNotify("Lỗi xóa hàng loạt đề thi: " + error.message, "error");
        }
    } catch (err) {
        showNotify("Lỗi kết nối hệ thống", "error");
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
// --- THỐNG KÊ PHÂN TÍCH (ANALYTICS) ---
const chartInstance = ref(null);
const chartCanvas = ref(null);

// 1. Tính toán Phổ điểm (Thang điểm 10)
const scoreDistribution = computed(() => {
    const dist = new Array(11).fill(0); // Mảng chứa số lượng HS đạt từ 0 -> 10 điểm
    filteredResults.value.forEach(res => {
        const roundedScore = Math.round(res.score); // Làm tròn điểm để gom nhóm
        if(roundedScore >= 0 && roundedScore <= 10) dist[roundedScore]++;
    });
    return dist;
});

// 2. Tính tỷ lệ làm đúng từng câu hỏi
const questionAnalytics = computed(() => {
    if (!currentExam.value || filteredResults.value.length === 0) return [];
    
    return currentExam.value.questions.map((q, qIdx) => {
        let correctCount = 0;
        
        filteredResults.value.forEach(res => {
            const ans = res.studentAnswersLog?.[qIdx];
            if (!ans) return;
            
            // Câu Trắc nghiệm
            if (q.type === 'mc' && ans.choice === q.correct) {
                correctCount++;
            } 
            // Câu Đúng/Sai (Tính là đúng nếu đúng cả 4 ý)
            else if (q.type === 'tf') {
                let match = 0;
                if(ans.choice && Array.isArray(ans.choice)) {
                    for(let i = 0; i < 4; i++) { if (ans.choice[i] === q.correct[i]) match++; }
                }
                if (match === 4) correctCount++;
            }
            // Câu tự luận (Nếu có điểm > 0 thì tính là có làm được bài)
            else if ((q.type === 'sa' || q.type === 'essay') && ans.score > 0) {
                correctCount++;
            }
        });

        // Tính %
        const rate = filteredResults.value.length > 0 
            ? Math.round((correctCount / filteredResults.value.length) * 100) 
            : 0;
            
        return { index: qIdx + 1, type: q.type, text: q.text, correctRate: rate };
    });
});

// 3. Hàm render Biểu đồ
const renderChart = () => {
    // Chờ DOM cập nhật
    setTimeout(() => {
        const ctx = document.getElementById('scoreChart');
        if (!ctx) return;

        // Xóa biểu đồ cũ nếu có để tránh lỗi đè canvas
        if (chartInstance.value) chartInstance.value.destroy();

        chartInstance.value = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
                datasets: [{
                    label: 'Số lượng học sinh',
                    data: scoreDistribution.value,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)', // Màu Blue-500
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }, 200);
};

// Gọi hàm vẽ biểu đồ mỗi khi vào tab kết quả hoặc khi kết quả thay đổi
watch([view, filteredResults], ([newView]) => {
    if (newView === 'view-results') {
        renderChart();
    }
});

// Đừng quên return `questionAnalytics` ra ngoài ở cuối hàm setup()
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
                
                // Đọc TOÀN BỘ trang
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
    
    // XỬ LÝ WORD (DOCX) - NÂNG CẤP TỰ ĐỘNG BẮT ẢNH VÀ KHÔNG BỊ CỘNG DỒN
    else if (fileExt === 'docx') {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (!window.mammoth) return showNotify("Thư viện Word chưa sẵn sàng!", "error");
            
            // Dùng convertToHtml thay vì extractRawText để lấy được hình ảnh
            mammoth.convertToHtml({ arrayBuffer: e.target.result })
            .then(res => { 
                const htmlContent = res.value;

                // Tạo một DOM ảo để bóc tách ảnh ra khỏi chữ
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlContent, 'text/html');

                const images = doc.querySelectorAll('img');
                window.eduexam_temp_images = []; // Biến tạm lưu ảnh Base64 trên RAM

                // Quét từng ảnh, lưu lại và để lại "dấu vết" [HINH_ANH_X]
                images.forEach((img, index) => {
                    window.eduexam_temp_images.push(img.src);
                    const placeholder = doc.createTextNode(` [HINH_ANH_${index}] `);
                    img.parentNode.replaceChild(placeholder, img);
                });

                // Chuyển HTML (đã thay ảnh bằng chữ) thành văn bản thuần
                let cleanText = doc.body.innerHTML
                                .replace(/<p[^>]*>/gi, '\n')
                                .replace(/<\/p>/gi, '\n')
                                .replace(/<br\s*[\/]?>/gi, '\n')
                                .replace(/<[^>]*>?/gm, ''); // Xóa sạch các thẻ HTML rác

                // Giải mã các ký tự đặc biệt (VD: &nbsp; thành dấu cách)
                const txt = document.createElement("textarea");
                txt.innerHTML = cleanText;
                cleanText = txt.value;

                // --- SỬA THÀNH GHI ĐÈ ĐỂ KHÔNG BỊ TRÙNG ĐỀ CŨ ---
                aiPrompt.value = cleanText; 
                showNotify(`Đã trích xuất chữ và tự động giữ lại ${images.length} hình ảnh từ Word!`); 
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
// 1. NÂNG CẤP PROMPT: Ép AI tách biệt tuyệt đối Câu hỏi, Đáp án và BẮT BUỘC TỰ GIẢI THÍCH
        const strictPrompt = `Bóc tách đề thi sau thành mảng JSON câu hỏi. 

        LƯU Ý CỰC KỲ QUAN TRỌNG VỀ PHÂN LOẠI CÂU HỎI (BẮT BUỘC TUÂN THỦ):
        - Nếu các đáp án được đánh dấu là A, B, C, D (in hoa) -> CHẮC CHẮN ĐÓ LÀ CÂU "mc" (Trắc nghiệm 1 đáp án).
        - Nếu các đáp án được đánh dấu là a), b), c), d) (chữ thường) -> CHẮC CHẮN ĐÓ LÀ CÂU "tf" (Trắc nghiệm đúng sai chùm 4 ý).
        - Nếu không có đáp án lựa chọn -> Đó là câu "sa" (Tự luận / Trả lời ngắn).

        CÁC QUY TẮC CẤU TRÚC KHÁC: 
        1. TÁCH BIỆT NỘI DUNG VÀ ĐÁP ÁN: Phần "text" CHỈ chứa nội dung câu hỏi / phần dẫn. Tuyệt đối KHÔNG gộp các đáp án vào trong "text". 
        2. LÀM SẠCH ĐÁP ÁN: Mảng "options" phải chứa nội dung của từng đáp án. KHÔNG BAO GIỜ bao gồm các tiền tố (VD: A., B., a), b)...).
        3. XUỐNG DÒNG: Giữ nguyên các dấu xuống dòng bằng ký tự \\n trong phần "text".
        4. HTML: Mã hóa dấu "<" thành "&lt;" và ">" thành "&gt;".
        5. CÔNG THỨC TOÁN (QUAN TRỌNG): BẮT BUỘC chuyển đổi mọi công thức Toán sang định dạng LaTeX (bọc trong \\( \\) hoặc $$ $$).
        6. HÌNH ẢNH: Giữ nguyên ký hiệu như [HINH_ANH_0] và đặt vào đúng vị trí.
        7. TỰ ĐỘNG GIẢI THÍCH (BẮT BUỘC): Đối với MỌI câu hỏi, BẠN PHẢI SỬ DỤNG KIẾN THỨC CỦA MÌNH ĐỂ TỰ SUY LUẬN ĐÁP ÁN VÀ VIẾT LỜI GIẢI THÍCH CHI TIẾT vào trường "explanation", ngay cả khi văn bản gốc không hề có lời giải. Lời giải phải phân tích rõ tại sao đáp án đó đúng, hoặc tại sao các đáp án khác sai để học sinh hiểu bài.

        Ví dụ Cấu trúc JSON Chuẩn cho câu MC:
        {
          "type": "mc",
          "text": "Thiết bị nào sau đây thường được tích hợp công nghệ AI nhận diện khuôn mặt?",
          "options": ["Chuột máy tính", "Máy in laser", "Điện thoại thông minh", "Bàn phím cơ"],
          "correct": 2,
          "explanation": "Điện thoại thông minh hiện nay thường được tích hợp AI để nhận diện khuôn mặt (VD: Face ID của Apple), giúp người dùng mở khóa thiết bị an toàn và nhanh chóng mà không cần nhập mật khẩu."
        }

        Ví dụ Cấu trúc JSON Chuẩn cho câu TF:
        {
          "type": "tf",
          "text": "Các nhận định sau về thiết kế CSDL:",
          "options": ["Trong bảng HOADON, MaKH là khóa ngoại", "Nên chọn TenKH làm khóa chính", "Thuộc tính MaHD có thể để trống", "Bảng KHACHHANG lưu trữ hóa đơn"],
          "correct": [true, false, false, false],
          "explanation": "a) Đúng vì MaKH dùng để liên kết với bảng KHACHHANG.\\nb) Sai vì Tên khách hàng có thể trùng nhau, không đảm bảo tính duy nhất để làm khóa chính.\\nc) Sai vì Khóa chính (MaHD) bắt buộc không được để trống (Not Null).\\nd) Sai vì thông tin hóa đơn phải được lưu ở bảng HOADON."
        }
        
        Ví dụ Cấu trúc JSON Chuẩn cho câu Toán học:
        {
          "type": "mc",
          "text": "Cho hàm số \\( y = \\frac{2x+1}{x-1} \\). Tập xác định của hàm số là:",
          "options": ["\\( \\mathbb{R} \\setminus \\{1\\} \\)", "\\( \\mathbb{R} \\)", "\\( (1; +\\infty) \\)", "\\( \\mathbb{R} \\setminus \\{-1\\} \\)"],
          "correct": 0,
          "explanation": "Hàm số phân thức có nghĩa khi mẫu số khác 0. Cho \\( x - 1 \\neq 0 \\Leftrightarrow x \\neq 1 \\). Vậy tập xác định của hàm số là \\( D = \\mathbb{R} \\setminus \\{1\\} \\)."
        }
        
        Nội dung cần xử lý: ${aiPrompt.value.trim()}`;

        // Gọi API
        const { data, error } = await supabaseClient.functions.invoke('generate-exam', { 
            body: { 
                prompt: strictPrompt, 
                imageBase64: aiImageBase64.value || null 
            } 
        });
        
        if (error) {
            const errBody = await error.context?.json(); 
            throw new Error(errBody?.error || "AI đang bận, vui lòng thử lại sau.");
        }
        
        // Trích xuất JSON từ AI
        let rawJson = "";
        if (typeof data === 'string') {
            rawJson = data;
        } else if (data && data.text) {
            rawJson = data.text;
        } else if (data && data.candidates && data.candidates.length > 0) {
            rawJson = data.candidates[0].content.parts[0].text;
        }

        if (!rawJson) {
            throw new Error("Không thể trích xuất dữ liệu từ AI.");
        }

        const cleanJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();
        let questions = JSON.parse(cleanJson);

        // Hàm BẢO VỆ THẺ HTML (Dành riêng cho TinyMCE - Câu hỏi và Giải thích)
        const safeEncodeHTML = (str) => {
            if (typeof str !== 'string') return str;
            let raw = str.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            return raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };

        // Hàm GIẢI MÃ HTML (Dành riêng cho Input Thường - Đáp án A B C D)
        const decodeForInputs = (str) => {
            if (typeof str !== 'string') return str;
            // Dịch ngược các mã an toàn của AI về lại dấu < và > nguyên bản
            return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        };

        // Hàm GIỮ NGUYÊN XUỐNG DÒNG (Chỉ dùng cho TinyMCE)
        const formatLineBreaks = (str) => {
            if (typeof str !== 'string') return str;
            return str.replace(/\n/g, '<br>');
        };

        // 2. CHUẨN HÓA CẤU TRÚC VÀ PHỤC HỒI HÌNH ẢNH
        questions = questions.map(q => {
            if (q.text) q.text = formatLineBreaks(safeEncodeHTML(q.text));
            if (q.explanation) q.explanation = formatLineBreaks(safeEncodeHTML(q.explanation));
            
            // --- ĐOẠN MỚI: PHỤC HỒI HÌNH ẢNH TỪ WORD VÀO ĐÚNG CHỖ ---
            if (q.text && window.eduexam_temp_images && window.eduexam_temp_images.length > 0) {
                q.text = q.text.replace(/\[HINH_ANH_(\d+)\]/g, (match, p1) => {
                    const imgIndex = parseInt(p1);
                    if (window.eduexam_temp_images[imgIndex]) {
                        return `<br><div style="text-align: center; margin-top: 10px;"><img src="${window.eduexam_temp_images[imgIndex]}" alt="Hình ảnh đính kèm" style="max-width: 100%; border-radius: 8px; display: inline-block;" /></div><br>`;
                    }
                    return match;
                });
            }
            // --------------------------------------------------------

            // Xử lý câu TRẮC NGHIỆM (mc)
            if (q.type === 'mc') {
                q.points = (q.points === undefined || q.points === null) ? 0.25 : q.points;
                if (q.options && Array.isArray(q.options)) {
                    q.options = q.options.map(opt => decodeForInputs(opt));
                }
            } 
            // Xử lý câu ĐÚNG/SAI (tf)
            else if (q.type === 'tf') {
                q.points = (q.points === undefined || q.points === null) ? 1.0 : q.points;
                if (!Array.isArray(q.options)) q.options = ["", "", "", ""];
                while (q.options.length < 4) q.options.push("");
                q.options = q.options.map(opt => decodeForInputs(opt));
                if (!Array.isArray(q.correct)) q.correct = [true, true, true, true];
                while (q.correct.length < 4) q.correct.push(true);
                q.correct = q.correct.map(c => c === true || c === "true");
            } 
            // Xử lý câu TỰ LUẬN (sa)
            else {
                q.points = (q.points === undefined || q.points === null) ? 0.5 : q.points;
            }

            return q;
        });

        // Thiết lập phôi đề thi & chuyển vào phòng soạn
        newExam.value.type = 'quiz'; 

        if (!newExam.value.title) newExam.value.title = `Đề bóc tách AI (${new Date().toLocaleDateString('vi-VN')})`;
        if (!newExam.value.time) newExam.value.time = 45; 
        if (!newExam.value.examCode) newExam.value.examCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!newExam.value.settings || !newExam.value.settings.scoreVisibility) newExam.value.settings = { ...defaultSettings };

        newExam.value.questions = questions;

        // Tự động nhảy Tab
        if (questions.length > 0 && questions[0].type) {
            activeQuestionTab.value = questions[0].type;
        } else {
            activeQuestionTab.value = 'mc'; 
        }

        showNotify(`Thành công! Đã bóc tách ${questions.length} câu.`);
        view.value = 'create-exam'; 

        // --- RESET DỮ LIỆU AI SAU KHI TẠO XONG ĐỂ KHÔNG BỊ CHỒNG CHÉO ---
        aiPrompt.value = '';
        aiUploadedImage.value = null;
        aiImageBase64.value = '';
        aiUploadedFileName.value = '';
        
    } catch (err) { 
        console.error("Lỗi AI:", err);
        showNotify("Lỗi: " + (err.message || "Đã xảy ra lỗi không xác định"), "error"); 
    } finally { 
        isGenerating.value = false; 
        window.eduexam_temp_images = []; // Dọn rác bộ nhớ sau khi hoàn thành
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
    showDetailedAnswers.value = false;

    // 3. Dừng bộ đếm thời gian
    if (timerInterval.value) clearInterval(timerInterval.value);
    
    // 4. Thoát chế độ toàn màn hình an toàn
    if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (err) { console.warn("Lỗi thoát Fullscreen:", err); }
    }

    try {
        let resData = null;
        const displayIdentity = `${studentProfile.value.fullName} - Lớp: ${studentProfile.value.className}`;

        // --- TÍNH TOÁN THỜI GIAN LÀM BÀI ---
        const timeSpentSeconds = (currentExam.value.time * 60) - timeLeft.value;
        const m = Math.floor(timeSpentSeconds / 60);
        const s = timeSpentSeconds % 60;
        const timeTakenStr = `${m} phút ${s} giây`;

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

            // XÓA TRƯỜNG id: Date.now() Ở ĐÂY
            resData = { 
                examId: currentExam.value.id, 
                studentName: displayIdentity, 
                submittedAt: new Date().toLocaleString('vi-VN'), 
                timeTaken: timeTakenStr, // LƯU THỜI GIAN LÀM BÀI
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
            // XÓA TRƯỜNG id: Date.now() Ở ĐÂY NỮA
            resData = { 
                examId: currentExam.value.id, 
                studentName: displayIdentity, 
                submittedAt: new Date().toLocaleString('vi-VN'), 
                timeTaken: timeTakenStr, // LƯU THỜI GIAN LÀM BÀI
                type: 'essay', 
                cheats: cheatWarnings.value, 
                fileData: studentFile.value, 
                score: 0, 
                status: 'pending' 
            };
        }

        // 7. Lưu vào Supabase và LẤY ID CHUẨN VỀ (Bằng cách thêm .select())
        const { data: insertedData, error } = await supabaseClient.from('results').insert([resData]).select();
        
        if (error) throw error;

        // Cập nhật giao diện bằng dữ liệu đã có ID chuẩn từ Database
        if (insertedData && insertedData.length > 0) {
            resData = insertedData[0]; // Gán lại resData để lấy ID chuẩn cho việc chấm AI bên dưới
            allResults.value.unshift(insertedData[0]); 
        }

        showNotify(cheatWarnings.value >= 3 ? "Tự động thu bài do vi phạm!" : "Nộp bài thành công!");
        
        // 8. Dọn dẹp an toàn: Xóa CẢ 2 bản nháp local
        localStorage.removeItem(`eduexam_backup_${currentExam.value.id}`);
        localStorage.removeItem(`eduexam_backup_exam_${currentExam.value.id}`);
        
        // 9. Chạy chấm bài nền bằng AI nếu có tự luận (Lúc này resData đã có ID chuẩn từ DB)
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
// --- HÀM ĐIỀU HƯỚNG CHO GIAO DIỆN SOẠN ĐỀ ---
const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
// --- TRẠNG THÁI ẨN/HIỆN BẢN ĐỒ SOẠN ĐỀ ---
const showEditExamMap = ref(false);
const scrollToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
};

const scrollToEditQuestion = (originalIdx, type) => {
    // 1. Nếu câu hỏi nằm ở phần khác (Ví dụ: Đang ở Trắc nghiệm nhưng bấm vào câu Tự luận) -> Tự động chuyển Tab
    if (activeQuestionTab.value !== type) {
        activeQuestionTab.value = type;
    }
    
    // 2. Chờ Vue render DOM xong thì mới bắt đầu cuộn tới đúng vị trí
    setTimeout(() => {
        const el = document.getElementById('edit-question-' + originalIdx);
        if (el) {
            const offset = 120; // Khoảng cách chừa ra cho thanh menu bên trên
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = el.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;

            window.scrollTo({
                top: elementPosition - offset,
                behavior: 'smooth'
            });
            
            // Thêm hiệu ứng nháy sáng nhẹ để dễ nhận biết câu đang sửa
            el.classList.add('ring-4', 'ring-blue-300');
            setTimeout(() => el.classList.remove('ring-4', 'ring-blue-300'), 1500);
        }
    }, 100); 
};


        const joinExamByCode = () => {
            if (!joinCode.value.trim()) return showNotify("Vui lòng nhập mã phòng thi!", "error"); 
            const ex = exams.value.find(e => e.examCode === joinCode.value.trim().toUpperCase());
            if (!ex) return showNotify("Mã không đúng hoặc phòng thi không tồn tại", "error"); 
            startExam(ex); 
            joinCode.value = '';
        };
// Thêm biến lưu đường link QR ngay phía trên hàm openQrModal
const currentQrLink = ref('');

const openQrModal = (exam) => { 
    currentQrCode.value = exam.examCode; 
    currentQrExamTitle.value = exam.title; 
    
    // TẠO ĐƯỜNG LINK TRỰC TIẾP VÀ MÃ HÓA NÓ CHO QR CODE
    const rawLink = `${window.location.origin}${window.location.pathname}?examCode=${exam.examCode}`;
    currentQrLink.value = encodeURIComponent(rawLink);
    
    showQrModal.value = true; 
};

// Hàm mới: Tải ảnh QR về máy
const downloadQrCode = async () => {
    try {
        showNotify("Đang tải mã QR...", "success");
        // Dùng kích thước 500x500 để ảnh nét hơn khi tải về
        const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${currentQrLink.value}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_VaoThi_${currentQrCode.value}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        showNotify("Lỗi tải ảnh QR: Trình duyệt chặn tải file", "error");
    }
};
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
// --- BỔ SUNG ĐOẠN DỌN DẸP VÀ KHỞI TẠO KÊNH ---
    if (examRoomChannel) {
        supabaseClient.removeChannel(examRoomChannel);
        examRoomChannel = null;
    }

    // Khởi tạo kênh Realtime với cấu hình đúng
    const channelName = `exam-room-${String(exam.id)}`;
    examRoomChannel = supabaseClient.channel(channelName, {
        config: {
            broadcast: { ack: false },
            presence: { key: studentProfile.value.fullName }
        }
    });

    const initialPayload = {
        studentName: `${studentProfile.value.fullName} - Lớp: ${studentProfile.value.className}`,
        progress: 0,
        total: exam.questions.length,
        cheats: 0,
        lastUpdate: new Date().toLocaleTimeString('vi-VN')
    };

    // Điểm danh (Track) duy nhất 1 lần khi kết nối thành công
    examRoomChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await examRoomChannel.track(initialPayload);
        }
    });

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

const saveNewUser = async () => {
    if (!newUserData.value.name.trim() || !newUserData.value.password.trim()) {
        return showNotify("Nhập đầy đủ thông tin", "error");
    }
    
    // BỔ SUNG: Chặn ngay từ Frontend nếu tên đã tồn tại
    if (users.value.find(u => u.name.toLowerCase() === newUserData.value.name.toLowerCase())) {
        return showNotify("Tên tài khoản này đã tồn tại trong hệ thống!", "error");
    }

    const newUser = { name: newUserData.value.name, password: newUserData.value.password, role: newUserData.value.role };

    // Thêm .select() để lấy lại dữ liệu mới nhất
    const { data, error } = await supabaseClient.from('users').insert([newUser]).select();
    
    if (!error && data) { 
        users.value.unshift(data[0]); // Đẩy lên đầu danh sách UI
        showAddModal.value = false; 
        showNotify(`Đã tạo tài khoản ${newUser.role} thành công!`); 
    } else {
        // Bắt lỗi Database nếu lọt qua Frontend
        if (error.code === '23505' || error.message.includes('unique constraint')) {
            showNotify("Tên tài khoản này đã có người sử dụng!", "error");
        } else {
            showNotify("Lỗi: " + error.message, "error");
        }
    }
};
const exportToExcel = () => {
    if (!currentExam.value || filteredResults.value.length === 0) {
        return showNotify("Không có dữ liệu để xuất file!", "error");
    }

    // Tiêu đề cột
    let csvContent = "\uFEFF"; // BOM để hiển thị đúng tiếng Việt
    csvContent += "Họ và tên,Thời gian nộp,Thời gian làm bài,Số lần vi phạm,Trạng thái,Điểm số\n";

    // Duyệt qua danh sách kết quả đã lọc
    filteredResults.value.forEach(res => {
        const row = [
            `"${res.studentName}"`,
            `"${res.submittedAt}"`,
            `"${res.timeTaken || 'Không ghi nhận'}"`,
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
const printDataList = ref([]);
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
    printDataList.value = [{
        ...JSON.parse(JSON.stringify(result)),
        examTitle: exam?.title || 'BÀI KIỂM TRA',
        questions: exam?.questions || []
    }];
    showPrintModal.value = true;
};
const openBulkPrintPreview = () => {
    if (selectedResults.value.length === 0) return;
    
    const exam = currentExam.value;
    const resultsToPrint = filteredResults.value.filter(r => selectedResults.value.includes(r.id));
    
    printDataList.value = resultsToPrint.map(res => ({
        ...JSON.parse(JSON.stringify(res)),
        examTitle: exam?.title || 'BÀI KIỂM TRA',
        questions: exam?.questions || []
    }));
    
    showPrintModal.value = true;
};
// Hàm xuất PDF (Tuyệt chiêu dùng Native Print - Khắc phục 100% lỗi trắng trang)
const exportToPDF = () => {
    showNotify("Đang mở trình xuất PDF... Vui lòng chọn 'Lưu dưới dạng PDF' (Save as PDF) nhé!", "success");
    
    // 1. Lấy phần tử chứa nội dung in và vùng bọc app
    const printElement = document.getElementById('printable-sheet');
    const appElement = document.getElementById('app');
    
    // 2. Ghi nhớ vị trí cũ của phiếu in trong cấu trúc HTML
    const originalParent = printElement.parentNode;
    const originalNextSibling = printElement.nextSibling;
    const originalStyle = printElement.getAttribute('style') || '';
    
    // Hàm dọn dẹp, khôi phục lại giao diện trang web sau khi xuất PDF xong
    let isRestored = false;
    const restoreUI = () => {
        if (isRestored) return;
        isRestored = true;
        
        // Lắp ráp phiếu in về lại đúng vị trí trong Modal
        printElement.setAttribute('style', originalStyle);
        if (originalNextSibling) {
            originalParent.insertBefore(printElement, originalNextSibling);
        } else {
            originalParent.appendChild(printElement);
        }
        
        // Hiện lại toàn bộ trang web
        appElement.style.display = '';
    };

    // Lắng nghe sự kiện ngay khi cửa sổ xuất file PDF đóng lại
    window.addEventListener('afterprint', restoreUI, { once: true });
    
    // 3. ẨN toàn bộ ứng dụng (Đây là bước cởi trói hoàn toàn khỏi Modal của Tailwind)
    appElement.style.display = 'none';
    
    // 4. Đưa phiếu in ra thẳng ngoài cùng của trang web
    document.body.appendChild(printElement);
    
    // 5. Trải phẳng kích thước đúng chuẩn A4
    printElement.style.position = 'absolute';
    printElement.style.left = '0';
    printElement.style.top = '0';
    printElement.style.width = '210mm'; 
    printElement.style.backgroundColor = '#ffffff';
    printElement.style.margin = '0';

    // 6. Gọi lệnh in của trình duyệt (Mở hộp thoại Save as PDF)
    setTimeout(() => {
        window.print();
        
        // Fallback dự phòng: Nếu máy nào không bắt được sự kiện afterprint thì sau 2 giây cũng tự khôi phục
        setTimeout(restoreUI, 2000);
    }, 500);
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
    // Nếu chưa vào phòng hoặc chưa có kết nối thì thoát
    if (view.value !== 'exam-room' || !currentExam.value || !examRoomChannel) return;

    // Tính toán tiến độ bài làm
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

    // CHỈ gửi bằng luồng Broadcast tốc độ cao (không dùng track ở đây)
    examRoomChannel.send({
        type: 'broadcast',
        event: 'progress',
        payload: statePayload
    });
};

const openLiveMonitor = (exam) => {
    teacherTab.value = 'monitor';
    currentExam.value = exam; 
    localStorage.setItem('eduexam_monitor_exam_id', exam.id);
    liveMonitors.value = []; // Reset danh sách
    
    if (examRoomChannel) supabaseClient.removeChannel(examRoomChannel);

    const channelName = `exam-room-${String(exam.id)}`;
    examRoomChannel = supabaseClient.channel(channelName, {
        config: { presence: { key: 'teacher' } }
    });
    
    // 1. Lắng nghe Broadcast: Chỉ cập nhật đúng tiến độ và lỗi vi phạm
    examRoomChannel.on('broadcast', { event: 'progress' }, ({ payload }) => {
        const currentList = [...liveMonitors.value]; 
        const idx = currentList.findIndex(s => s.studentName === payload.studentName);
        
        if (idx !== -1) {
            // Hợp nhất dữ liệu mới nhất (chỉ đè tiến độ, không làm mất danh sách)
            currentList[idx] = { ...currentList[idx], ...payload }; 
        } else {
            currentList.push(payload); 
        }
        
        liveMonitors.value = currentList; // Cập nhật Reactivity
    });

    // 2. Lắng nghe Presence: Chỉ điểm danh người mới vào
    examRoomChannel.on('presence', { event: 'sync' }, () => {
        const state = examRoomChannel.presenceState();
        const currentList = [...liveMonitors.value];

        for (const key in state) {
            if (key !== 'teacher' && state[key].length > 0) {
                const studentData = state[key][0];
                const idx = currentList.findIndex(s => s.studentName === studentData.studentName);
                
                // NẾU HỌC SINH MỚI: Thêm vào danh sách. Nếu có rồi thì bỏ qua để Broadcast lo tiến độ.
                if (idx === -1) {
                    currentList.push(studentData);
                }
            }
        }
        liveMonitors.value = currentList; 
    });

    examRoomChannel.subscribe();
};
// --- HÀM COPY LINK VÀO THI NHANH ---
const copyExamLink = (code) => {
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}?examCode=${code}`;
    navigator.clipboard.writeText(link).then(() => {
        showNotify("Đã copy Link, bạn có thể gửi ngay cho học sinh!");
    }).catch(() => {
        showNotify("Lỗi copy link, trình duyệt của bạn không hỗ trợ!", "error");
    });
};
// --- TÍNH NĂNG MỚI: TỰ ĐỘNG GẮN ẢNH VÀO ĐÚNG CÂU HỎI THEO TÊN FILE ---
const handleAutoAttachImages = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let attachedCount = 0;
    let notFoundCount = 0;
    showNotify("Đang xử lý hình ảnh...", "success");

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Quét tìm CHỮ SỐ đầu tiên trong tên file (VD: "cau1.png" -> "1", "hinh-cau-12.jpg" -> "12")
        const match = file.name.match(/\d+/);
        
        if (match) {
            const qNumber = parseInt(match[0], 10);
            const qIndex = qNumber - 1; // Vì mảng câu hỏi bắt đầu từ 0

            // Kiểm tra xem câu hỏi có tồn tại trong phôi đề chưa
            if (newExam.value.questions[qIndex]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64Img = e.target.result;
                    // Tạo thẻ img HTML với class bo góc đẹp mắt
                    const imgTag = `<br><div style="text-align: center; margin-top: 10px;"><img src="${base64Img}" alt="Hình ảnh minh họa" style="max-width: 100%; border-radius: 8px; display: inline-block;" /></div>`;
                    
                    // Nối thẳng thẻ ảnh vào nội dung (text) của câu hỏi đó
                    newExam.value.questions[qIndex].text += imgTag;
                };
                reader.readAsDataURL(file);
                attachedCount++;
            } else {
                notFoundCount++;
            }
        }
    }

    // Đợi xử lý xong File Reader rồi báo cáo kết quả
    setTimeout(() => {
        let msg = `Đã tự động gắn ${attachedCount} ảnh vào các câu tương ứng!`;
        if (notFoundCount > 0) msg += ` (Bỏ qua ${notFoundCount} ảnh vì không tìm thấy câu hỏi).`;
        showNotify(msg, attachedCount > 0 ? "success" : "error");
        event.target.value = ''; // Reset input để có thể chọn lại file cũ nếu cần
    }, 500);
};
return {
    searchArchiveQuery,
currentArchivePage,
totalArchivePages,
paginatedArchivedExams,
    showDetailedAnswers,
    publicExams,         // <--- THÊM DÒNG NÀY (Để UI thấy được danh sách Chợ đề thi)
    cloneExam,
    generateFromBank,
    showMatrixGenerator,
     matrixSettings,
    globalQuestionBank,
    questionAnalytics,
    handleAutoAttachImages,
    currentQrLink,
downloadQrCode,
    copyExamLink,
    folders,
    filteredFolders,
    showFolderModal,
    newFolderName,
    activeFolderId,
contextMenu,
showMoveModal,
openContextMenu,
createFolder,
deleteFolder,
moveExamToFolder,
archivedExams,
showEditExamMap,
scrollToTop,
scrollToBottom,
scrollToEditQuestion,
currentExamPage,
totalExamPages,
paginatedExams,
    selectedExams,
    showBulkDeleteExamConfirm,
    toggleSelectAllExams,
    confirmBulkDeleteExams,
    selectedResults,
    showBulkDeleteResultConfirm,
    toggleSelectAllResults,
    confirmBulkDeleteResults,
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
    showDeleteConfirm,
    userToDelete,
    confirmDeleteUser,
    exportToPDF,
    openPrintPreview,
    openBulkPrintPreview,
    printDataList,
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
}; // KẾT THÚC SETUP
    }
});

// KHỞI TẠO COMPONENT SOẠN THẢO VĂN BẢN VỚI TINYMCE 7 (BẢN PRO)
const RichTextEditor = {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `
        <div class="rich-text-container bg-white rounded-xl shadow-sm border border-gray-200">
            <textarea ref="editor"></textarea>
        </div>
    `,
mounted() {
        tinymce.init({
            target: this.$refs.editor,
            license_key: 'gpl',
            min_height: 250,
            resize: 'both', 
            menubar: false,
            promotion: false, 
            branding: false,  
            paste_data_images: true, 
            placeholder: this.placeholder || 'Nhập nội dung câu hỏi...',
            
            plugins: [
                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                'media', 'table', 'wordcount'
            ],
            
            // BỔ SUNG NÚT "math_templates" VÀO THANH CÔNG CỤ
            toolbar: 'undo redo | math_templates | blocks fontfamily fontsize | ' +
                'bold italic underline strikethrough forecolor backcolor | ' +
                'alignleft aligncenter alignright alignjustify | ' +
                'bullist numlist table image | removeformat fullscreen',
            
            image_title: true,
            automatic_uploads: true,
            file_picker_types: 'image',
            file_picker_callback: (cb, value, meta) => {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');

                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.addEventListener('load', () => {
                        const base64 = reader.result.split(',')[1];
                        const blobInfo = tinymce.activeEditor.editorUpload.blobCache.create(file.name, file, base64);
                        tinymce.activeEditor.editorUpload.blobCache.add(blobInfo);
                        cb(blobInfo.blobUri(), { title: file.name });
                    });
                    reader.readAsDataURL(file);
                });
                input.click(); 
            },
            
            content_style: `
                body { font-family: 'Inter', sans-serif; font-size: 16px; color: #1f2937; line-height: 1.6; }
                p { margin: 0 0 8px 0; }
                img { max-width: 100%; height: auto; border-radius: 8px; cursor: se-resize; }
                table { border-collapse: collapse; width: 100%; }
                td, th { border: 1px dashed #ccc; padding: 8px; }
            `,
            
            setup: (editor) => {
                // TẠO MENU CÔNG THỨC TOÁN HỌC (LATEX)
                editor.ui.registry.addMenuButton('math_templates', {
                    text: '∑ Toán Học',
                    tooltip: 'Chèn nhanh công thức Toán học',
                    fetch: (callback) => {
                        const items = [
                            { type: 'menuitem', text: '1. Phân số (a/b)', onAction: () => editor.insertContent('\\( \\frac{a}{b} \\) ') },
                            { type: 'menuitem', text: '2. Lũy thừa / Mũ (x²)', onAction: () => editor.insertContent('\\( x^2 \\) ') },
                            { type: 'menuitem', text: '3. Chỉ số dưới (x₁)', onAction: () => editor.insertContent('\\( x_1 \\) ') },
                            { type: 'menuitem', text: '4. Căn bậc hai (√x)', onAction: () => editor.insertContent('\\( \\sqrt{x} \\) ') },
                            { type: 'menuitem', text: '5. Căn bậc n (ⁿ√x)', onAction: () => editor.insertContent('\\( \\sqrt[n]{x} \\) ') },
                            { type: 'menuitem', text: '6. Tích phân (∫)', onAction: () => editor.insertContent('\\( \\int_{a}^{b} f(x) dx \\) ') },
                            { type: 'menuitem', text: '7. Giới hạn (lim)', onAction: () => editor.insertContent('\\( \\lim_{x \\to \\infty} f(x) \\) ') },
                            { type: 'menuitem', text: '8. Tổng Sigma (∑)', onAction: () => editor.insertContent('\\( \\sum_{i=1}^{n} x_i \\) ') },
                            { type: 'menuitem', text: '9. Vector (v)', onAction: () => editor.insertContent('\\( \\vec{v} \\) ') },
                            { type: 'menuitem', text: '10. Ký hiệu Góc', onAction: () => editor.insertContent('\\( \\widehat{ABC} \\) ') },
                            { type: 'menuitem', text: '11. Thuộc / Không thuộc', onAction: () => editor.insertContent('\\( \\in \\) / \\( \\notin \\) ') },
                            { type: 'menuitem', text: '12. Hệ phương trình', onAction: () => editor.insertContent('<p>$$ \\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases} $$</p>') },
                            { type: 'menuitem', text: '13. Ma trận 2x2', onAction: () => editor.insertContent('<p>$$ \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} $$</p>') },
                        ];
                        callback(items);
                    }
                });

                this.editor = editor;
                
                editor.on('init', () => {
                    editor.setContent(this.modelValue || '');
                });

                editor.on('change keyup paste undo redo', () => {
                    this.$emit('update:modelValue', editor.getContent());
                });
            }
        });
    },
    watch: {
        modelValue(newVal) {
            if (this.editor && newVal !== this.editor.getContent()) {
                this.editor.setContent(newVal || '');
            }
        }
    },
    beforeUnmount() {
        if (this.editor) {
            this.editor.remove(); // Tránh tràn bộ nhớ
        }
    }
};

// ĐĂNG KÝ COMPONENT VÀ CHẠY ỨNG DỤNG
app.component('rich-text-editor', RichTextEditor);
app.mount('#app');