const { createApp, ref, computed, onMounted, watch } = Vue;

const supabaseUrl = 'https://dtfdzuggnitsdnlutryn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmR6dWdnbml0c2RubHV0cnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mjk0NTAsImV4cCI6MjA5MDUwNTQ1MH0.9Ne1ONIO9-ASkThtFZJLxV42dbyIMGkHwweIjTZ5A6Q';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

createApp({
    setup() {
        // ==========================================
        // 1. KHAI BÁO TẤT CẢ CÁC BIẾN (STATE) Ở ĐÂY
        // ==========================================
        // --- KHÔI PHỤC TRẠNG THÁI TỪ LOCALSTORAGE ---
        const savedUser = localStorage.getItem('eduexam_user');
        const currentUser = ref(savedUser ? JSON.parse(savedUser) : null);

        const savedTeacherTab = localStorage.getItem('eduexam_teacherTab');
        const teacherTab = ref(savedTeacherTab || 'exams');
        // THÊM 2 DÒNG NÀY ĐỂ QUẢN LÝ PHIÊN ĐĂNG NHẬP
        const savedSessionId = localStorage.getItem('eduexam_sessionId');
        const sessionId = ref(savedSessionId || Math.random().toString(36).substring(2, 10));

        const savedView = localStorage.getItem('eduexam_view');
        let initialView = 'login';
        if (currentUser.value) {
            // Danh sách các trang không nên khôi phục khi F5 (vì chứa dữ liệu tạm thời)
            const transientViews = ['exam-room', 'presentation', 'view-results', 'create-exam'];
            if (savedView && !transientViews.includes(savedView)) {
                initialView = savedView;
            } else {
                initialView = currentUser.value.role === 'admin' ? 'admin-dash' : currentUser.value.role === 'teacher' ? 'teacher-dash' : 'student-dash';
            }
        }
        const view = ref(initialView);
        // ---------------------------------------------
        // --- TỰ ĐỘNG LƯU TRẠNG THÁI KHI CÓ THAY ĐỔI ---
        watch(currentUser, (newVal) => {
            if (newVal) localStorage.setItem('eduexam_user', JSON.stringify(newVal));
            else localStorage.removeItem('eduexam_user');
        }, { deep: true });

        watch(view, (newVal) => {
            localStorage.setItem('eduexam_view', newVal);
        });

        watch(teacherTab, (newVal) => {
            localStorage.setItem('eduexam_teacherTab', newVal);
        });
        // ---------------------------------------------
        
        // Khai báo sớm biến currentExam và dữ liệu học sinh
        const currentExam = ref(null);
        const studentAnswers = ref([]);
        const studentFile = ref(null);
        const timeLeft = ref(0);
        const timerInterval = ref(null);
        const finalResult = ref({ score: 0, correct: 0 });
        const cheatWarnings = ref(0);
        const isAIGradingSubmission = ref(false); // Biến trạng thái nộp bài
        const isFullscreen = ref(false);

        // Biến Trình chiếu
        const currentSlide = ref(0);
        const showSlideAnswer = ref(false);

        // Biến Giám sát Real-time
        const monitoringExamId = ref('');
        const isMonitoring = ref(false);
        const activeStudents = ref({});
        let teacherChannel = null;
        let studentChannel = null;

        // Biến AI Soạn đề
        const aiPrompt = ref('');
        const isGenerating = ref(false);
        const aiMatrix = ref({ mc: true, tf: false, sa: false });
        const aiUploadedImage = ref(null);
        const aiImageBase64 = ref('');
        const aiUploadedFileName = ref(''); 

        // Biến User & Auth
        const authForm = ref({ name: '', password: '', role: 'student' });
        const showEditModal = ref(false);
        const editUserData = ref({ id: '', name: '', password: '', role: '' });
        const showAddModal = ref(false);
        const newUserData = ref({ name: '', password: '', role: 'teacher' });
        
        const searchUser = ref(''); // <--- THÊM DÒNG NÀY VÀO ĐÂY

        // Biến Hệ thống
        const FIXED_ACCOUNTS = [{ id: 1, name: 'admin', password: 'admin123', role: 'admin' }];
        const users = ref([]);
        const exams = ref([]);
        const allResults = ref([]);
        const notification = ref({ show: false, message: '', type: 'success' });

        // Biến Cấu hình Đề thi (Settings Modal)
        const showSettingsModal = ref(false);
        const defaultSettings = { 
            password: '', 
            attemptLimit: 0, 
            autoMonitor: true, 
            shuffleMode: true, 
            scoreVisibility: 'always',
            answerVisibility: 'always',
            tfGradingScale: [0, 0.1, 0.25, 0.5, 1.0] // Mảng điểm: [0 đúng, 1 đúng, 2 đúng, 3 đúng, 4 đúng]
        };
        const newExam = ref({ title: '', type: 'quiz', time: 15, questions: [], essayContent: '', settings: {...defaultSettings} });

        const gradingModal = ref(false);
        const currentGradingResult = ref(null);
        const manualScore = ref(0);
        const questionScores = ref([]); 

        // THÊM BIẾN MỚI CHO TÍNH NĂNG MÃ PHÒNG THI / QR:
        const joinCode = ref('');
        const showQrModal = ref(false);
        const currentQrCode = ref('');
        const currentQrExamTitle = ref('');

        // ==========================================
        // 2. CÁC HÀM XỬ LÝ (LOGIC FUNCTIONS)
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

        const handleVisibilityChange = () => {
            if (view.value === 'exam-room' && document.hidden) {
                if(currentExam.value?.settings?.autoMonitor === false) return; 

                cheatWarnings.value++;
                showNotify(`CẢNH BÁO: Bạn đã rời khỏi màn hình thi ${cheatWarnings.value} lần!`, 'error');
                sendRealtimeUpdate('Cảnh báo gian lận!');
                
                if (cheatWarnings.value >= 3) {
                    alert('Bạn đã vi phạm quy chế thi (chuyển tab quá 3 lần). Hệ thống tự động thu bài!');
                    submitExam();
                }
            }
        };
        // Hàm theo dõi việc thoát Toàn màn hình
        const handleFullscreenChange = () => {
            // Kiểm tra trạng thái Fullscreen trên tất cả trình duyệt
            const isFull = !!(document.fullscreenElement || 
                              document.webkitFullscreenElement || 
                              document.mozFullScreenElement || 
                              document.msFullscreenElement);
            
            // CẬP NHẬT BIẾN NÀY ĐỂ HẾT BỊ MÀN HÌNH ĐEN CHE
            isFullscreen.value = isFull; 
            
            if (view.value === 'exam-room' && !isFull) {
                cheatWarnings.value++;
                showNotify("CẢNH BÁO: Bạn đã thoát chế độ Toàn màn hình!", "error");
                sendRealtimeUpdate('Thoát Toàn màn hình');
                
                if (cheatWarnings.value >= 5) {
                    alert("Vi phạm quá nhiều lần. Hệ thống tự động nộp bài!");
                    submitExam();
                }
            }
        };

        // Hàm yêu cầu bật Toàn màn hình (Cần thêm hàm này để nút "BẮT ĐẦU THI" hoạt động)
        const enterFullScreen = () => {
            const elem = document.documentElement;
            const requestMethod = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;

            if (requestMethod) {
                requestMethod.call(elem).then(() => {
                    isFullscreen.value = true; // Cập nhật ngay lập tức
                    showNotify("Đã vào chế độ Toàn màn hình. Chúc bạn thi tốt!");
                }).catch(err => {
                    showNotify("Không thể vào Toàn màn hình: " + err.message, "error");
                });
            }
        };
        // Hàm quản lý phiên đăng nhập tập trung (Presence)
        const setupGlobalAuthPresence = async () => {
            if (!currentUser.value) return;

            // Tạo một kênh riêng biệt cho mỗi người dùng dựa trên ID của họ
            const userChannel = supabaseClient.channel(`auth-presence-${currentUser.value.id}`, {
                config: { presence: { key: currentUser.value.id } }
            });

            userChannel
                .on('presence', { event: 'sync' }, () => {
                    const state = userChannel.presenceState();
                    const sessions = state[currentUser.value.id];

                    if (sessions && sessions.length > 1) {
                        // Tìm xem có session nào khác với sessionId hiện tại của máy này không
                        const otherSession = sessions.find(s => s.sessionId !== sessionId.value);
                        if (otherSession) {
                            showNotify("Tài khoản đang được đăng nhập ở thiết bị khác!", "error");
                            // Tùy chọn: Có thể tự động logout ở đây nếu muốn gắt gao
                            // logout();
                        }
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        // Đăng ký định danh của thiết bị hiện tại lên hệ thống
                        await userChannel.track({
                            userId: currentUser.value.id,
                            userName: currentUser.value.name,
                            sessionId: sessionId.value,
                            onlineAt: new Date().toISOString()
                        });
                    }
                });
        };
        const loadData = async () => {
            const [uRes, eRes, rRes] = await Promise.all([
                supabaseClient.from('users').select('*'),
                supabaseClient.from('exams').select('*'),
                supabaseClient.from('results').select('*')
            ]);
            
            if (uRes.data) users.value = uRes.data;
            if (eRes.data) exams.value = eRes.data;
            if (rRes.data) allResults.value = rRes.data;

            if (!users.value.find(u => u.name === 'admin')) {
                await supabaseClient.from('users').insert(FIXED_ACCOUNTS);
                users.value.push(...FIXED_ACCOUNTS);
            }
        };

        onMounted(() => {
            // 1. Tải dữ liệu từ Database lên hệ thống
            loadData();
            
            // 2. CHỐNG GIAN LẬN: Chặn chuột phải (Context Menu)
            document.addEventListener('contextmenu', (e) => {
                if (view.value === 'exam-room') {
                    e.preventDefault();
                    showNotify("Hành động bị cấm trong phòng thi!", "error");
                }
            });

            // 3. CHỐNG GIAN LẬN: Chặn phím tắt Copy/Paste/Cut/Save/Xem nguồn
            document.addEventListener('keydown', (e) => {
                // Chỉ chặn phím khi đang ở TRONG phòng thi (view === 'exam-room') 
                // VÀ khi đã vào chế độ Fullscreen thành công
                const isExamActive = view.value === 'exam-room' && (document.fullscreenElement || document.webkitFullscreenElement);
                
                if (isExamActive) {
                    if (e.ctrlKey && ['c', 'v', 'x', 's', 'u'].includes(e.key.toLowerCase())) {
                        e.preventDefault();
                        showNotify("Phím tắt bị vô hiệu hóa!", "error");
                    }
                    if (e.key === 'F12') e.preventDefault();
                }
            });

            // 4. CHỐNG GIAN LẬN: Chặn dán (Paste) trực tiếp vào ô trả lời
            document.addEventListener('paste', (e) => {
                if (view.value === 'exam-room') {
                    e.preventDefault();
                    showNotify("Bạn phải tự nhập câu trả lời, không được dán văn bản!", "error");
                }
            });

            // 5. THEO DÕI VI PHẠM: Chuyển Tab hoặc ẩn trình duyệt
            document.addEventListener('visibilitychange', handleVisibilityChange);
            
            // 6. BẢO MẬT: Quản lý Toàn màn hình (Fullscreen)
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

            // 7. PHIÊN ĐĂNG NHẬP: Đảm bảo máy luôn có sessionId để đá thiết bị cũ
            if (!localStorage.getItem('eduexam_sessionId')) {
                localStorage.setItem('eduexam_sessionId', sessionId.value);
            }
            
            // 8. REAL-TIME: Kích hoạt Presence nếu người dùng đã đăng nhập
            if (currentUser.value) {
                setupGlobalAuthPresence(); 
            }
        });

        const switchView = (target) => {
            authForm.value.name = '';
            authForm.value.password = '';
            view.value = target;
        };

        const getRoleName = (role) => role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : 'Học sinh';
        const getRoleBadgeClass = (role) => role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'teacher' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';

        const handleRegister = async () => {
            if (!authForm.value.name.trim() || !authForm.value.password.trim()) return showNotify("Vui lòng điền đầy đủ thông tin", "error");
            if (users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase())) return showNotify("Tên người dùng đã tồn tại", "error");
            
            const newUser = { id: Date.now(), name: authForm.value.name, password: authForm.value.password, role: 'student' };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            
            if (!error) {
                users.value.push(newUser);
                showNotify("Đăng ký thành công! Bạn có thể đăng nhập ngay.");
                switchView('login');
            } else showNotify("Lỗi CSDL: " + error.message, "error");
        };

        const handleLogin = () => {
            // 1. Kiểm tra đầu vào
            if (!authForm.value.name.trim() || !authForm.value.password.trim()) {
                return showNotify("Vui lòng nhập tên và mật khẩu", "error");
            }

            // 2. Tìm kiếm người dùng trong hệ thống
            const user = users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase());
            
            if (!user) {
                return showNotify("Tài khoản không tồn tại", "error");
            }
            if (user.password !== authForm.value.password) {
                return showNotify("Mật khẩu không chính xác", "error");
            }

            // 3. Kiểm tra quyền truy cập đặc biệt cho Admin
            if (view.value === 'admin-login' && user.role !== 'admin') {
                return showNotify("Bạn không có quyền truy cập quản trị", "error");
            }

            // 4. Thiết lập phiên đăng nhập mới (Session ID)
            // Mỗi lần đăng nhập sẽ tạo một mã ngẫu nhiên mới để "đá" các trình duyệt cũ đang dùng cùng tài khoản
            sessionId.value = Math.random().toString(36).substring(2, 10);
            localStorage.setItem('eduexam_sessionId', sessionId.value);

            // 5. Lưu thông tin người dùng hiện tại
            currentUser.value = user;
            showNotify(`Chào mừng ${user.name} đã quay trở lại!`);

            // 6. Điều hướng giao diện dựa trên vai trò (Role)
            if (user.role === 'admin') {
                view.value = 'admin-dash';
            } else if (user.role === 'teacher') {
                view.value = 'teacher-dash';
                teacherTab.value = 'exams'; 
            } else {
                view.value = 'student-dash';
            }
        };

        const logout = () => {
            if (view.value === 'exam-room' && !confirm("Tiến trình thi sẽ bị hủy. Đăng xuất?")) return;
            if (studentChannel) supabaseClient.removeChannel(studentChannel);
            if (teacherChannel) supabaseClient.removeChannel(teacherChannel);
            
            // Xóa sạch bộ nhớ
            localStorage.removeItem('eduexam_user');
            localStorage.removeItem('eduexam_view');
            localStorage.removeItem('eduexam_teacherTab');

            view.value = 'login';
            currentUser.value = null;
            clearInterval(timerInterval.value);
            showNotify("Đã đăng xuất thành công!");
        };

        const goHome = () => {
            if (view.value === 'exam-room' && !confirm("Rời khỏi phòng thi?")) return;
            if (view.value === 'presentation') exitPresentation();
            clearInterval(timerInterval.value);
            view.value = currentUser.value.role === 'admin' ? 'admin-dash' : currentUser.value.role === 'teacher' ? 'teacher-dash' : 'student-dash';
        };

        const startPresentation = (exam) => {
            if(exam.type !== 'quiz') return showNotify("Chế độ Trình chiếu hiện chỉ hỗ trợ đề Trắc nghiệm!", "error");
            currentExam.value = exam;
            currentSlide.value = 0;
            showSlideAnswer.value = false;
            view.value = 'presentation';
        };
        const nextSlide = () => { if (currentSlide.value < currentExam.value.questions.length - 1) { currentSlide.value++; showSlideAnswer.value = false; } };
        const prevSlide = () => { if (currentSlide.value > 0) { currentSlide.value--; showSlideAnswer.value = false; } };
        const exitPresentation = () => { view.value = 'teacher-dash'; teacherTab.value = 'exams'; };

        const startMonitoring = () => {
            if (!monitoringExamId.value) return showNotify("Vui lòng chọn 1 đề thi từ danh sách!", "error");
            isMonitoring.value = true;
            activeStudents.value = {}; 
            
            if (teacherChannel) supabaseClient.removeChannel(teacherChannel);
            teacherChannel = supabaseClient.channel('room-' + monitoringExamId.value);
            
            // NÂNG CẤP LÊN PRESENCE ĐỂ ĐỒNG BỘ TRẠNG THÁI LIÊN TỤC
            teacherChannel.on('presence', { event: 'sync' }, () => {
                const presenceState = teacherChannel.presenceState();
                let active = {};
                // Lọc dữ liệu của tất cả học sinh đang online trong phòng
                for (let id in presenceState) {
                    const data = presenceState[id][0]; 
                    active[data.studentName] = data;
                }
                activeStudents.value = active;
            }).subscribe((status) => {
                if (status === 'SUBSCRIBED') showNotify("🚀 Đã mở Phòng thi 4.0! Sẵn sàng nhận dữ liệu...");
            });
        };

        const sendRealtimeUpdate = async (statusText = 'Đang làm bài') => {
            if (!studentChannel || !currentExam.value) return;
            
            // 1. Tính toán tiến độ làm bài thực tế dựa trên loại câu hỏi
            let answeredCount = 0;
            if (currentExam.value.type === 'quiz') {
                answeredCount = studentAnswers.value.filter((ans, idx) => {
                    const qType = currentExam.value.questions[idx]?.type;
                    
                    // Nếu là câu Đúng/Sai: Chỉ tính là đã làm nếu HS đã chọn đủ cả 4 ý Đ/S
                    if (qType === 'tf') {
                        return ans.choice && 
                               Array.isArray(ans.choice) && 
                               ans.choice.filter(c => c !== null).length === 4;
                    }
                    
                    // Nếu là Trắc nghiệm hoặc Tự luận: Tính là đã làm nếu có chọn đáp án, có chữ hoặc có ảnh
                    return ans.choice !== null || 
                           (ans.text && ans.text.trim() !== '') || 
                           ans.fileData !== null;
                }).length;
            } else {
                // Đối với đề tự luận nộp file duy nhất
                answeredCount = studentFile.value ? 1 : 0;
            }
            
            const totalCount = currentExam.value.questions?.length || 1;
            
            // 2. Sử dụng tính năng Presence Track để đồng bộ dữ liệu lên máy chủ Giáo viên
            // Dữ liệu này sẽ được hàm startMonitoring của GV nhận và hiển thị ngay lập tức
            await studentChannel.track({
                studentName: currentUser.value.name,
                progress: answeredCount,
                total: totalCount,
                cheats: cheatWarnings.value,
                status: statusText,
                lastUpdate: Date.now()
            });
        };

        const filteredUsers = computed(() => {
            if (!searchUser.value) return users.value;
            return users.value.filter(u => u.name.toLowerCase().includes(searchUser.value.toLowerCase()));
        });

        const openAddModal = () => { newUserData.value = { name: '', password: '', role: 'teacher' }; showAddModal.value = true; };
        const saveNewUser = async () => {
            if (!newUserData.value.name.trim() || !newUserData.value.password.trim()) return showNotify("Vui lòng nhập tên và mật khẩu", "error");
            if (users.value.find(u => u.name.toLowerCase() === newUserData.value.name.toLowerCase())) return showNotify("Tên người dùng đã tồn tại", "error");
            const newUser = { id: Date.now(), ...newUserData.value };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            if (!error) { users.value.push(newUser); showAddModal.value = false; showNotify("Đã tạo người dùng mới."); }
        };

        const deleteUser = async (id) => { 
            if (confirm("Xóa tài khoản này?")) {
                const { error } = await supabaseClient.from('users').delete().eq('id', id);
                if (!error) { users.value = users.value.filter(u => u.id !== id); showNotify("Đã xóa tài khoản."); }
            }
        };

        const updateUserRole = async (user, newRole) => { 
            const { error } = await supabaseClient.from('users').update({ role: newRole }).eq('id', user.id);
            if (!error) { user.role = newRole; showNotify("Cập nhật vai trò thành công."); }
        };
        
        const openEditModal = (user) => { editUserData.value = { ...user }; showEditModal.value = true; };
        const saveUserEdit = async () => {
            const { error } = await supabaseClient.from('users').update({ name: editUserData.value.name, password: editUserData.value.password, role: editUserData.value.role }).eq('id', editUserData.value.id);
            if (!error) {
                const index = users.value.findIndex(u => u.id === editUserData.value.id);
                if (index !== -1) users.value[index] = { ...editUserData.value };
                showEditModal.value = false;
                showNotify("Lưu thông tin thành công.");
            }
        };

        // Bổ sung hỗ trợ tạo câu hỏi tự luận/đúng sai thủ công
        const addQuestion = (type = 'mc') => {
            let options = ['', '', '', ''];
            let correct = 0;
            
            if (type === 'tf') { 
                options = ['', '', '', '']; // 4 mệnh đề
                correct = [true, true, true, true]; // Mặc định đáp án cho 4 ý
            }
            if (type === 'sa' || type === 'essay') { options = []; correct = null; } 
            
            newExam.value.questions.push({ 
                type: type, text: '', options: options, 
                correct: correct, explanation: '', points: type === 'tf' ? 1.0 : 0.25 
            });
        };
        const removeQuestion = (idx) => newExam.value.questions.splice(idx, 1);
        
        // Hàm mở giao diện chỉnh sửa đề thi
        const openEditExam = (exam) => {
            newExam.value = JSON.parse(JSON.stringify(exam));
            view.value = 'create-exam';
        };

        // Hàm mở form tạo đề mới (để reset form trắng)
        const openCreateNewExam = () => {
            newExam.value = { title: '', type: 'quiz', time: 15, questions: [], essayContent: '', settings: { ...defaultSettings } };
            view.value = 'create-exam';
        };

        const saveExam = async () => {
            if (!newExam.value.title) return showNotify("Vui lòng nhập tên bài tập", "error");
            if (newExam.value.type === 'quiz' && newExam.value.questions.length === 0) return showNotify("Cần ít nhất 1 câu hỏi", "error");
            
            const isEditing = !!newExam.value.id; // Kiểm tra xem có đang sửa đề không
            if(!newExam.value.settings) newExam.value.settings = {...defaultSettings};
            
            const examData = { 
                ...newExam.value, 
                creator: currentUser.value.name,
                examCode: newExam.value.examCode || Math.random().toString(36).substring(2, 8).toUpperCase()
            };

            let error;
            if (isEditing) {
                const { error: err } = await supabaseClient.from('exams').update(examData).eq('id', newExam.value.id);
                error = err;
            } else {
                examData.id = Date.now();
                const { error: err } = await supabaseClient.from('exams').insert([examData]);
                error = err;
            }
            
            if (!error) {
                if (isEditing) {
                    const idx = exams.value.findIndex(e => e.id === examData.id);
                    if (idx !== -1) exams.value[idx] = examData;
                    showNotify("Đã cập nhật đề thi thành công!");
                } else {
                    exams.value.push(examData);
                    showNotify("Đã giao bài thành công! Mã phòng thi: " + examData.examCode);
                }
                newExam.value = { title: '', type: 'quiz', time: 15, questions: [], essayContent: '', settings: {...defaultSettings} };
                view.value = 'teacher-dash';
                teacherTab.value = 'exams';
            } else {
                showNotify("Lỗi: " + error.message, "error");
            }
        };

        const deleteExam = async (id) => {
            if(confirm("Bạn có chắc muốn xóa đề/bài tập này vĩnh viễn?")) {
                await supabaseClient.from('exams').delete().eq('id', id);
                await supabaseClient.from('results').delete().eq('examId', id);
                exams.value = exams.value.filter(e => e.id !== id);
                allResults.value = allResults.value.filter(r => r.examId !== id);
                showNotify("Đã xóa đề thi.");
            }
        };

        const viewResults = (id) => { currentExam.value = exams.value.find(e => e.id === id); view.value = 'view-results'; };
        
        const filteredResults = computed(() => {
            if (!currentExam.value) return [];
            const resultsForExam = allResults.value.filter(r => r.examId === currentExam.value.id);
            
            const attemptCounts = {};
            resultsForExam.forEach(r => {
                attemptCounts[r.studentName] = (attemptCounts[r.studentName] || 0) + 1;
            });
            
            return resultsForExam.map(r => ({
                ...r,
                totalAttempts: attemptCounts[r.studentName]
            }));
        });

        const handleAiFileUpload = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            aiUploadedImage.value = null;
            aiImageBase64.value = '';
            aiUploadedFileName.value = file.name;
            
            const fileExt = file.name.split('.').pop().toLowerCase();
            showNotify("Đang xử lý file, vui lòng đợi...", "success");

            if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    aiUploadedImage.value = e.target.result; 
                    aiImageBase64.value = e.target.result.split(',')[1]; 
                    showNotify("Đã tải ảnh lên thành công!");
                };
                reader.readAsDataURL(file);
            } 
            else if (fileExt === 'pdf') {
                const reader = new FileReader();
                reader.onload = async function() {
                    try {
                        const typedarray = new Uint8Array(this.result);
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                        const pdf = await pdfjsLib.getDocument(typedarray).promise;
                        let fullText = "";
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map(item => item.str).join(" ") + "\n";
                        }
                        aiPrompt.value = "Trích xuất từ PDF:\n" + fullText + "\n\n" + aiPrompt.value;
                        showNotify("Đã đọc xong PDF! Nội dung đã được nạp vào ô nhập liệu.");
                    } catch (error) {
                        showNotify("Lỗi đọc PDF: " + error.message, "error");
                    }
                };
                reader.readAsArrayBuffer(file);
            } 
            else if (['doc', 'docx'].includes(fileExt)) {
                const reader = new FileReader();
                reader.onload = function(loadEvent) {
                    mammoth.extractRawText({arrayBuffer: loadEvent.target.result})
                        .then(function(result){
                            aiPrompt.value = "Trích xuất từ Word:\n" + result.value + "\n\n" + aiPrompt.value;
                            showNotify("Đã đọc xong Word! Nội dung đã được nạp vào ô nhập liệu.");
                        })
                        .catch(function(err){
                            showNotify("Lỗi đọc file Word: " + err.message, "error");
                        });
                };
                reader.readAsArrayBuffer(file);
            } else {
                showNotify("Định dạng file không được hỗ trợ!", "error");
                aiUploadedFileName.value = '';
            }
        };
        // ==========================================
        // KHỐI LOGIC: TRÍCH XUẤT NHANH BẰNG REGEX (KHÔNG AI)
        // ==========================================

        // Cập nhật hàm trích xuất từ file để gán điểm mặc định 
        const parseTextToQuestions = (text) => {
            const questions = [];
            // 1. CHUẨN HÓA: Dọn dẹp khoảng trắng rác và các ký tự đặc biệt từ Word/PDF
            const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ');

            // 2. TÁCH KHỐI: Tìm theo từ khóa Câu/Question và số thứ tự
            const qBlocks = cleanText.split(/(?=Câu\s*\d+)|(?=Question\s*\d+)/i);
            
            qBlocks.forEach((block) => {
                const trimmedBlock = block.trim();
                if (trimmedBlock.length < 15) return;

                const lines = trimmedBlock.split(/(?=A[\.\)\:\s])|(?=B[\.\)\:\s])|(?=C[\.\)\:\s])|(?=D[\.\)\:\s])/i).map(l => l.trim());
                
                // Lấy đề bài (phần text trước khi gặp chữ A.)
                let qText = lines[0].replace(/^(?:Câu|Bài|Question)\s*\d+[\.\:\-]?\s*/i, '').trim();
                // Loại bỏ các thẻ phân loại như (NB), (TH), (VD) trong đề Toán
                qText = qText.replace(/\((?:NB|TH|VD|VDC)\)\s*[:\-]?\s*/g, '');

                let options = [];
                let correct = 0;
                let foundOptions = false;

                // 3. BÓC TÁCH ĐÁP ÁN: Duyệt từ phần tử thứ 1 trở đi trong mảng lines
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i];
                    const optMatch = line.match(/^([A-D])[\.\)\:\s]+(.*)/i);
                    
                    if (optMatch && options.length < 4) {
                        // Nếu nội dung đáp án bị trống (chỉ có dấu chấm), ta để tạm là "..." 
                        // để giáo viên tự điền sau khi nhìn vào file gốc
                        let content = optMatch[2].trim();
                        options.push(content || "...");
                        if (options.length === 4) foundOptions = true;
                    }
                }

                // 4. TRUY TÌM ĐÁP ÁN ĐÚNG TRONG TOÀN KHỐI
                const searchArea = trimmedBlock.toLowerCase();
                // Tìm các mẫu: "đáp án A", "chọn B", "A đúng", hoặc nhãn được đánh dấu đặc biệt
                const ansMatch = searchArea.match(/(?:đáp án|chọn|đúng là|là)\s*[:\-\s]*([a-d])(?!\w)/i);
                
                if (ansMatch) {
                    correct = ansMatch[1].toUpperCase().charCodeAt(0) - 65;
                } else {
                    // Tìm mẫu "A. [Nội dung] - Đúng"
                    const linesForCorrect = trimmedBlock.split('\n');
                    for(let l of linesForCorrect) {
                        if (l.toLowerCase().includes('đúng') || l.toLowerCase().includes('chính xác')) {
                            const m = l.match(/^([A-D])[\.\)]/i);
                            if(m) { correct = m[1].toUpperCase().charCodeAt(0) - 65; break; }
                        }
                    }
                }

                if (qText && qText.length > 5) {
                    questions.push({
                        type: foundOptions ? 'mc' : 'sa',
                        text: qText,
                        options: options,
                        correct: correct,
                        explanation: "Trích xuất tự động từ file đề thi.",
                        points: 0.25
                    });
                }
            });
            return questions;
        };

        const handleFastImport = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop().toLowerCase();
            let fullText = "";
            showNotify("Đang đọc file cục bộ... Vui lòng không đóng trang.", "success");

            try {
                if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
                    // Dùng Tesseract quét ảnh Offline
                    if (!window.Tesseract) throw new Error("Chưa tải xong thư viện nhận diện ảnh. Vui lòng thử lại sau vài giây.");
                    const worker = await Tesseract.createWorker('vie'); // Load ngôn ngữ Tiếng Việt
                    const ret = await worker.recognize(file);
                    fullText = ret.data.text;
                    await worker.terminate();
                } 
                else if (fileExt === 'pdf') {
                    const typedarray = new Uint8Array(await file.arrayBuffer());
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        fullText += textContent.items.map(item => item.str).join(" ") + "\n";
                    }
                } 
                else if (['doc', 'docx'].includes(fileExt)) {
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    fullText = result.value;
                } else {
                    throw new Error("Định dạng file không hỗ trợ!");
                }

                // Chạy qua Regex Parser
                const extractedQuestions = parseTextToQuestions(fullText);
                
                if (extractedQuestions.length > 0) {
                    newExam.value.questions.push(...extractedQuestions);
                    showNotify(`Đã bóc tách siêu tốc ${extractedQuestions.length} câu hỏi! Hãy kiểm tra lại.`, "success");
                } else {
                    showNotify("Không tìm thấy câu hỏi nào. Hãy đảm bảo file có chữ 'Câu 1:', 'A.', 'B.'...", "error");
                }

            } catch (err) {
                showNotify("Lỗi đọc file: " + err.message, "error");
            }
            
            event.target.value = ''; // Reset input file
        };
        const handleGenerateAI = async () => {
            if (!aiPrompt.value.trim() && !aiImageBase64.value) {
                return showNotify("Vui lòng tải file lên hoặc nhập chủ đề!", "error");
            }
            
            let selectedTypes = [];
            if(aiMatrix.value.mc) selectedTypes.push("Trắc nghiệm (mc)");
            if(aiMatrix.value.tf) selectedTypes.push("Đúng/Sai (tf)");
            if(aiMatrix.value.sa) selectedTypes.push("Tự luận/Trả lời ngắn (sa)");
            if(selectedTypes.length === 0) return showNotify("Vui lòng chọn ít nhất 1 loại câu hỏi ở Ma trận đề!", "error");

            isGenerating.value = true;
            try {
                const basePrompt = `Bạn là một giáo viên chuyên gia. 
                Nhiệm vụ: Tạo đề thi dựa trên yêu cầu: "${aiPrompt.value}".
                Dữ liệu đầu vào bổ sung (nếu có): ${aiImageBase64.value ? 'Hình ảnh đính kèm' : 'Không có'}.

                YÊU CẦU CẤU TRÚC:
                - Nếu người dùng yêu cầu số lượng cụ thể (ví dụ: 50 câu trắc nghiệm, 2 câu tự luận), hãy tuân thủ TUYỆT ĐỐI.
                - Với câu hỏi Trắc nghiệm: type là "mc", có "options" và "correct".
                - Với câu hỏi Tự luận/Trả lời ngắn: type là "sa", "options" để mảng rỗng [], "correct" để null.
                - Luôn kèm theo "explanation" (giải thích/đáp án mẫu) cho mỗi câu để AI có thể tự động chấm tự luận dựa vào phần này.

                BẮT BUỘC trả về ĐÚNG định dạng mảng JSON thuần túy:
                [
                  {"type": "mc", "text": "...", "options": ["A","B","C","D"], "correct": 0, "explanation": "..."},
                  {"type": "sa", "text": "...", "options": [], "correct": null, "explanation": "Hướng dẫn chấm hoặc đáp án mẫu..."}
                ]`;

                const { data, error } = await supabaseClient.functions.invoke('generate-exam', {
                    body: { prompt: basePrompt, imageBase64: aiImageBase64.value }
                });

                if (error) throw error;
                if (data && data.error) throw new Error(data.error.message || JSON.stringify(data.error));
                if (!data || !data.candidates || data.candidates.length === 0) throw new Error("Google Gemini không trả về dữ liệu hợp lệ.");

                let textResponse = data.candidates[0].content.parts[0].text;
                textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                
                const rawQuestions = JSON.parse(textResponse);
                const generatedQuestions = rawQuestions.map(q => ({
                    text: q.text || q.question || "Nội dung câu hỏi bị thiếu",
                    options: q.options || [],
                    correct: q.correct !== undefined ? q.correct : null,
                    type: q.type || 'mc',
                    explanation: q.explanation || q.explain || ''
                }));
                
                newExam.value = { title: 'Đề xuất từ AI', type: 'quiz', time: 45, questions: generatedQuestions, essayContent: '', settings: {...defaultSettings} };
                showNotify("AI đã trích xuất & tạo đề thành công!");
                
                aiPrompt.value = ''; 
                aiUploadedImage.value = null; 
                aiImageBase64.value = ''; 
                aiUploadedFileName.value = ''; 
                view.value = 'create-exam'; 
            } catch (err) {
                console.error("Chi tiết lỗi:", err);
                showNotify(err.message || "Lỗi xử lý AI.", "error");
            } finally {
                isGenerating.value = false;
            }
        };

        const exportToWord = (exam) => {
            let content = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>${exam.title}</title>
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 14pt; line-height: 1.5; }
                .title { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
                .time { text-align: center; font-size: 12pt; font-style: italic; margin-bottom: 20px; }
                .question { font-weight: bold; margin-top: 15px; margin-bottom: 5px;}
                .options { margin-left: 15px; }
                .option { margin-bottom: 5px; }
                .key-title { font-weight: bold; text-align: center; font-size: 14pt; margin-top: 30px; margin-bottom: 15px; text-decoration: underline; }
            </style></head><body>`;
            content += `<div class='title'>ĐỀ THI: ${exam.title}</div><div class='time'>Thời gian làm bài: ${exam.time} phút</div>`;

            if (exam.type === 'quiz') {
                exam.questions.forEach((q, index) => {
                    content += `<div class='question'>Câu ${index + 1}: ${q.text}</div>`;
                    if(q.type === 'mc' || q.type === 'tf') {
                        content += `<div class='options'>`;
                        q.options.forEach((opt, oIndex) => {
                            content += `<div class='option'>${String.fromCharCode(65 + oIndex)}. ${opt}</div>`;
                        });
                        content += `</div>`;
                    } else {
                        content += `<div class='options' style="height: 100px;">(Học sinh điền đáp án/làm bài tự luận)</div>`;
                    }
                });
                
                content += `<br><hr><div class='key-title'>BẢNG ĐÁP ÁN & LỜI GIẢI</div><div>`;
                exam.questions.forEach((q, index) => {
                    content += `<div style="margin-bottom: 10px; line-height: 1.6;">`;
                    if(q.type === 'mc' || q.type === 'tf') {
                        content += `<b>Câu ${index + 1}:</b> Đáp án đúng: <b>${String.fromCharCode(65 + q.correct)}</b>`;
                    } else {
                        content += `<b>Câu ${index + 1} (Tự luận):</b>`;
                    }
                    if (q.explanation && q.explanation.trim() !== '') {
                        content += `<br><i>Giải thích / Đáp án mẫu:</i> ${q.explanation}`;
                    }
                    content += `</div>`;
                });
                content += `</div>`;
                
            } else {
                content += `<div class='question'>Nội dung tự luận:</div><div>${exam.essayContent.replace(/\n/g, '<br>')}</div>`;
            }
            content += `</body></html>`;
            const blob = new Blob(['\ufeff', content], { type: 'application/msword' }); 
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `De_Thi_${exam.title.replace(/\s+/g, '_')}.doc`; 
            document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
            showNotify("Đã tải xuống file Word thành công!");
        };

        const openGradingModal = (result) => { 
            currentGradingResult.value = result; 
            manualScore.value = result.score || 0; 

            // Lấy thông tin đề thi để biết cấu hình điểm từng câu
            const exam = exams.value.find(e => e.id === result.examId);
            
            if (exam && result.studentAnswersLog) {
                // Khởi tạo mảng điểm cho từng câu dựa trên log bài làm của học sinh
                questionScores.value = result.studentAnswersLog.map((ans, i) => {
                    // Nếu đã có điểm được lưu từ trước đó (đã chấm rồi), thì lấy điểm đó
                    if (ans.score !== undefined) return ans.score; 
                    
                    const q = exam.questions[i];
                    const p = q.points || 0; // Lấy điểm cấu hình tối đa của câu này

                    // 1. Logic chấm điểm cho Trắc nghiệm (mc)
                    if (q.type === 'mc') {
                        return (ans.choice === q.correct) ? p : 0;
                    }

                    // 2. Logic chấm điểm cho Đúng/Sai (tf) - Thang điểm luỹ tiến 4 mức
                    if (q.type === 'tf') {
                        let match = 0;
                        // So sánh từng ý trong chùm 4 ý
                        for (let j = 0; j < 4; j++) {
                            if (ans.choice && ans.choice[j] === q.correct[j]) {
                                match++;
                            }
                        }
                        
                        // Lấy thang điểm từ cấu hình Settings của đề thi [0, 1 đúng, 2 đúng, 3 đúng, 4 đúng]
                        // Mặc định: [0, 0.1, 0.25, 0.5, 1.0]
                        let scale = exam.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0];
                        
                        // Trả về mức điểm tương ứng với số ý đúng (match)
                        return scale[match] || 0;
                    }

                    // 3. Logic cho Tự luận (sa/essay)
                    // Mặc định ban đầu là 0, giáo viên sẽ tự nhập điểm sau khi xem bài
                    return 0; 
                });
            } else {
                questionScores.value = [];
            }

            gradingModal.value = true; 
        };

        // Hàm tự động cộng dồn tổng điểm khi sửa điểm từng câu
        const updateTotalScore = () => {
            const total = questionScores.value.reduce((sum, score) => sum + (parseFloat(score) || 0), 0);
            manualScore.value = parseFloat(total.toFixed(2));
        };

        const saveManualGrade = async () => {
            // Cập nhật điểm từng câu vào log bài làm
            let updatedLog = null;
            if (currentGradingResult.value.studentAnswersLog) {
                updatedLog = currentGradingResult.value.studentAnswersLog.map((ans, i) => ({
                    ...ans,
                    score: questionScores.value[i] || 0
                }));
            }

            const { error } = await supabaseClient.from('results').update({ 
                score: parseFloat(manualScore.value), 
                status: 'graded',
                studentAnswersLog: updatedLog || currentGradingResult.value.studentAnswersLog
            }).eq('id', currentGradingResult.value.id);

            if (!error) {
                const idx = allResults.value.findIndex(r => r.id === currentGradingResult.value.id);
                if (idx !== -1) { 
                    allResults.value[idx].score = parseFloat(manualScore.value); 
                    allResults.value[idx].status = 'graded'; 
                    if (updatedLog) {
                        allResults.value[idx].studentAnswersLog = updatedLog;
                    }
                }
                gradingModal.value = false;
                showNotify("Đã lưu điểm thành công!");
            } else {
                showNotify("Lỗi khi lưu điểm: " + error.message, "error");
            }
        };

        const startExam = (exam) => {
            try {
                // 1. Kiểm tra mật khẩu và lượt làm bài
                if (exam.settings?.password) {
                    const userPass = prompt("Đề thi này được bảo mật. Vui lòng nhập mật khẩu:");
                    if (userPass !== exam.settings.password) return showNotify("Mật khẩu không chính xác!", "error");
                }

                // 2. Tạo bản sao đề và trộn câu hỏi/đáp án
                let examCopy = JSON.parse(JSON.stringify(exam));
                if (examCopy.type === 'quiz' && examCopy.settings?.shuffleMode !== false) { 
                    examCopy.questions = shuffleArray(examCopy.questions);
                    examCopy.questions.forEach(q => {
                        if((q.type === 'mc' || q.type === 'tf') && q.options?.length > 0) {
                            const originalCorrect = q.options[q.correct];
                            q.options = shuffleArray(q.options);
                            q.correct = q.options.indexOf(originalCorrect);
                        }
                    });
                }
                
                // 3. Khởi tạo đáp án trống cho học sinh
                studentAnswers.value = examCopy.questions.map(q => ({
                    choice: q.type === 'tf' ? [null, null, null, null] : null,
                    text: '',        
                    fileData: null   
                }));

                // 4. Thiết lập các thông số ban đầu
                studentFile.value = null; 
                currentExam.value = examCopy; 
                timeLeft.value = examCopy.time * 60;
                cheatWarnings.value = 0;
                isFullscreen.value = false; // Reset trạng thái màn hình chờ

                // 5. Chuyển sang giao diện phòng thi
                view.value = 'exam-room';
                
                // 6. Kích hoạt Real-time (Bọc trong try để không làm đứng hàm nếu lỗi mạng)
                try {
                    if (studentChannel) supabaseClient.removeChannel(studentChannel);
                    studentChannel = supabaseClient.channel('room-' + exam.id);
                    studentChannel.subscribe(async (status) => {
                        if(status === 'SUBSCRIBED') await sendRealtimeUpdate('Vừa vào phòng thi');
                    });
                } catch (e) { console.error("Lỗi Real-time:", e); }
                
                // 7. Chạy đồng hồ đếm ngược
                if (timerInterval.value) clearInterval(timerInterval.value);
                timerInterval.value = setInterval(() => {
                    if (timeLeft.value > 0) timeLeft.value--;
                    else { showNotify("Hết thời gian!", "error"); submitExam(); }
                }, 1000);

            } catch (error) {
                console.error("Lỗi startExam:", error);
                showNotify("Có lỗi xảy ra khi bắt đầu làm bài: " + error.message, "error");
            }
        };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) return showNotify("Vui lòng chọn file dưới 5MB", "error");
            const reader = new FileReader();
            reader.onload = (e) => { studentFile.value = e.target.result; };
            reader.readAsDataURL(file);
        };

        // Hàm Upload hình ảnh Từng Câu cho Tự luận
        const handlePerQuestionFileUpload = (event, idx) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) return showNotify("Vui lòng chọn file dưới 5MB", "error");
            const reader = new FileReader();
            reader.onload = (e) => { 
                studentAnswers.value[idx].fileData = e.target.result; 
            };
            reader.readAsDataURL(file);
        };

        const formattedTime = computed(() => {
            const m = Math.floor(timeLeft.value / 60); const s = timeLeft.value % 60;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        });

        // Cập nhật chấm điểm AI theo trọng số điểm từng câu 
        const backgroundAIGrading = async (resultRecord, examData) => {
            let totalUserScore = 0;
            const gradingPromises = examData.questions.map(async (q, i) => {
                const ans = resultRecord.studentAnswersLog[i];
                const p = q.points || 0;
                if ((q.type === 'mc' || q.type === 'tf') && ans.choice === q.correct) return p;
                if ((q.type === 'sa' || q.type === 'essay') && (ans.text.trim() !== '' || ans.fileData)) {
                    // Gọi AI chấm... (logic giữ nguyên nhưng nhân với q.points)
                    const payload = { prompt: `...`, imageBase64: ans.fileData?.split(',')[1] };
                    const { data } = await supabaseClient.functions.invoke('generate-exam', { body: payload });
                    if (data?.candidates) {
                        let scorePercentage = parseFloat(data.candidates[0].content.parts[0].text.replace(/[^0-9.]/g, '')) / 100;
                        return scorePercentage * p; // Tính điểm dựa trên trọng số câu đó 
                    }
                }
                return 0;
            });

            const scores = await Promise.all(gradingPromises);
            totalUserScore = scores.reduce((a, b) => a + b, 0);

            await supabaseClient.from('results').update({ score: totalUserScore, status: 'graded' }).eq('id', resultRecord.id);
            const idx = allResults.value.findIndex(r => r.id === resultRecord.id);
            if (idx !== -1) { allResults.value[idx].score = totalUserScore; allResults.value[idx].status = 'graded'; }
        };

        // Logic tính điểm dựa trên thuộc tính points của từng câu 
        const submitExam = async () => {
            // Ngừng đếm ngược và cập nhật trạng thái cuối cùng
            clearInterval(timerInterval.value);
            sendRealtimeUpdate('Đã nộp bài');
            if (studentChannel) supabaseClient.removeChannel(studentChannel);

            isAIGradingSubmission.value = true;

            if (currentExam.value.type === 'quiz') {
                let userTotalScore = 0;
                let correctCount = 0;
                let hasEssay = false;

                // 1. Duyệt qua từng câu hỏi để chấm điểm trắc nghiệm và đúng/sai
                currentExam.value.questions.forEach((q, i) => {
                    const ans = studentAnswers.value[i];
                    const p = q.points || 0; // Trọng số điểm của câu hỏi này

                    if (q.type === 'mc') {
                        // Chấm trắc nghiệm: Đúng thì cộng trọn điểm của câu đó
                        if (ans.choice === q.correct) {
                            correctCount++;
                            userTotalScore += p;
                        }
                    } else if (q.type === 'tf') {
                        // Chấm Đúng/Sai chùm 4 ý theo thang điểm luỹ tiến
                        let match = 0;
                        for (let j = 0; j < 4; j++) {
                            if (ans.choice && ans.choice[j] === q.correct[j]) {
                                match++;
                            }
                        }
                        if (match > 0) correctCount++;
                        
                        // Lấy thang điểm từ Settings (Mặc định: [0, 0.1, 0.25, 0.5, 1.0])
                        let scale = currentExam.value.settings?.tfGradingScale || [0, 0.1, 0.25, 0.5, 1.0];
                        userTotalScore += (scale[match] || 0);
                    } else if (q.type === 'sa' || q.type === 'essay') {
                        // Kiểm tra nếu có nội dung tự luận để bật chế độ chấm AI
                        if (ans.text.trim() !== '' || ans.fileData) {
                            hasEssay = true;
                        }
                    }
                });

                // 2. Chuẩn bị dữ liệu lưu vào Database
                let resultData = { 
                    id: Date.now(), 
                    examId: currentExam.value.id, 
                    studentName: currentUser.value.name, 
                    submittedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'), 
                    type: currentExam.value.type,
                    cheats: cheatWarnings.value,
                    score: userTotalScore, // Điểm số tạm tính (đã bao gồm điểm trắc nghiệm/đúng sai)
                    correct: correctCount,
                    studentAnswersLog: studentAnswers.value,
                    status: hasEssay ? 'grading' : 'graded'
                };

                const { error } = await supabaseClient.from('results').insert([resultData]);
                isAIGradingSubmission.value = false;

                if (!error) {
                    allResults.value.push(resultData);
                    
                    // Chuyển về Dashboard ngay lập tức để học sinh không phải chờ AI
                    view.value = 'student-dash'; 
                    showNotify("Nộp bài thành công! " + (hasEssay ? "AI đang chấm tự luận ngầm..." : ""));

                    // 3. Nếu có câu tự luận, kích hoạt chấm điểm AI đa luồng phía sau
                    if (hasEssay) {
                        backgroundAIGrading(resultData, currentExam.value);
                    }
                } else {
                    showNotify("Lỗi CSDL khi nộp bài: " + error.message, "error");
                }
            } else {
                // Xử lý nộp bài cho dạng đề Tự Luận Thuần Túy (Nộp tệp duy nhất)
                let resultData = { 
                    id: Date.now(), 
                    examId: currentExam.value.id, 
                    studentName: currentUser.value.name, 
                    submittedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'), 
                    type: currentExam.value.type,
                    cheats: cheatWarnings.value,
                    fileData: studentFile.value, 
                    score: 0, 
                    status: 'pending'
                };
                
                const { error } = await supabaseClient.from('results').insert([resultData]);
                if (!error) {
                    allResults.value.push(resultData);
                    view.value = 'student-dash';
                    showNotify("Nộp bài thành công!");
                } else {
                    showNotify("Lỗi nộp bài: " + error.message, "error");
                }
            }
        };
// Logic vào thi bằng mã Code
        const joinExamByCode = () => {
            if (!joinCode.value.trim()) return showNotify("Vui lòng nhập mã đề thi", "error");
            const codeToSearch = joinCode.value.trim().toUpperCase();
            const examToJoin = exams.value.find(e => e.examCode === codeToSearch);
            
            if (!examToJoin) return showNotify("Không tìm thấy đề thi với mã này!", "error");
            
            startExam(examToJoin);
            joinCode.value = ''; // Xóa trắng ô nhập sau khi vào
        };

        // Logic mở Modal QR Code cho Giáo viên
        const openQrModal = (exam) => {
            if (!exam.examCode) return showNotify("Đề thi cũ chưa có mã Code. Hãy tạo đề mới!", "error");
            currentQrCode.value = exam.examCode;
            currentQrExamTitle.value = exam.title;
            showQrModal.value = true;
        };
        return {
            // 1. Quản lý Trạng thái & Giao diện
            view, currentUser, authForm, users, exams, newExam,
            teacherTab, notification, searchUser, isFullscreen,
            
            // 2. Quản lý Đề thi & Phòng thi
            currentExam, studentAnswers, studentFile, timeLeft, formattedTime, 
            finalResult, cheatWarnings, isAIGradingSubmission,
            
            // 3. Quản lý Mã tham gia & QR
            joinCode, showQrModal, currentQrCode, currentQrExamTitle,
            
            // 4. Quản lý Chấm điểm & Kết quả
            gradingModal, currentGradingResult, manualScore, questionScores, 
            allResults, filteredResults,
            
            // 5. Quản lý Trình chiếu & Giám sát
            currentSlide, showSlideAnswer, monitoringExamId, isMonitoring, activeStudents,
            
            // 6. Cài đặt & AI
            showSettingsModal, aiPrompt, isGenerating, aiMatrix, 
            aiUploadedImage, aiUploadedFileName,

            // 7. Các hàm Hệ thống & Tài khoản
            showNotify, handleLogin, handleRegister, logout, goHome, switchView,
            getRoleName, getRoleBadgeClass, deleteUser, updateUserRole,
            filteredUsers, openEditModal, saveUserEdit, openAddModal, saveNewUser,

            // 8. Các hàm Đề thi & Chấm điểm
            addQuestion, removeQuestion, saveExam, openEditExam, openCreateNewExam,
            deleteExam, viewResults, openGradingModal, saveManualGrade, 
            updateTotalScore, backgroundAIGrading,

            // 9. Các hàm Làm bài & Bảo mật
            startExam, enterFullScreen, joinExamByCode, openQrModal,
            handleFileUpload, handlePerQuestionFileUpload, submitExam,
            sendRealtimeUpdate, 

            // 10. Các hàm Công cụ & AI Soạn đề
            handleAiFileUpload, handleGenerateAI, exportToWord, handleFastImport,
            startPresentation, nextSlide, prevSlide, exitPresentation, startMonitoring
        };
    }
}).mount('#app');