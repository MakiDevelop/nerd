$(document).ready(function() {
    // 用戶令牌和信息
    let userToken = localStorage.getItem('userToken');
    let userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    
    // 模態框實例
    const usageLimitModal = new bootstrap.Modal(document.getElementById('usageLimitModal'));
    
    // 初始化頁面
    initPage();
    
    // 獲取使用次數
    fetchUsage();
    
    // 表單提交事件
    $("#extractForm").on("submit", function(e) {
        e.preventDefault();
        
        // 獲取輸入的文本
        const content = $("#contentInput").val().trim();
        
        // 檢查是否有輸入文本
        if (!content) {
            alert("請輸入需要萃取標籤的文本");
            return;
        }
        
        // 顯示加載動畫
        $("#resultCard").show();
        $("#loadingSpinner").show();
        $("#resultContent").empty();
        
        // 準備請求頭
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // 如果用戶已登入，添加授權令牌
        if (userToken) {
            headers['Authorization'] = `Bearer ${userToken}`;
        }
        
        // 發送API請求
        $.ajax({
            url: "/api/extract-tags",
            type: "POST",
            contentType: "application/json",
            headers: headers,
            data: JSON.stringify({
                content: content
            }),
            success: function(response) {
                // 隱藏加載動畫
                $("#loadingSpinner").hide();
                
                // 顯示結果
                displayResults(response);
                
                // 更新使用次數
                fetchUsage();
            },
            error: function(xhr, status, error) {
                // 隱藏加載動畫
                $("#loadingSpinner").hide();
                
                // 檢查是否超出使用限制
                if (xhr.status === 429) {
                    // 顯示使用限制提示模態框
                    usageLimitModal.show();
                    return;
                }
                
                // 顯示錯誤信息
                $("#resultContent").html(
                    `<div class="error-message">
                        <h4>發生錯誤</h4>
                        <p>${xhr.responseJSON?.message || "請求失敗，請稍後再試"}</p>
                    </div>`
                );
            }
        });
    });
    
    // 登出按鈕點擊事件
    $("#logoutBtn").on("click", function() {
        // 清除本地存儲的用戶信息
        localStorage.removeItem('userToken');
        localStorage.removeItem('userInfo');
        
        // 重置用戶變量
        userToken = null;
        userInfo = {};
        
        // 更新頁面
        initPage();
        
        // 更新使用次數
        fetchUsage();
    });
    
    // 初始化頁面
    function initPage() {
        if (userToken && userInfo.name) {
            // 顯示用戶信息
            $("#userInfo").show();
            $("#loginSection").hide();
            $("#userName").text(userInfo.name);
            $("#userPicture").attr("src", userInfo.picture || "");
        } else {
            // 顯示登入按鈕
            $("#userInfo").hide();
            $("#loginSection").show();
        }
    }
    
    // 獲取使用次數
    function fetchUsage() {
        // 準備請求頭
        const headers = {};
        
        // 如果用戶已登入，添加授權令牌
        if (userToken) {
            headers['Authorization'] = `Bearer ${userToken}`;
        }
        
        $.ajax({
            url: "/api/usage",
            type: "GET",
            headers: headers,
            success: function(response) {
                // 更新使用次數顯示
                $("#usageCount").text(response.usage);
                $("#usageLimit").text(response.limit);
                
                // 如果已達到限制，禁用提交按鈕
                if (response.remaining <= 0) {
                    $("#extractButton").prop("disabled", true).text("今日使用次數已達上限");
                } else {
                    $("#extractButton").prop("disabled", false).text("萃取標籤");
                }
            },
            error: function(xhr, status, error) {
                console.error("獲取使用次數失敗:", error);
            }
        });
    }
    
    // 顯示結果的函數 - 只顯示標籤名稱（key）
    function displayResults(data) {
        const resultContent = $("#resultContent");
        resultContent.empty();
        
        // 檢查是否有結果數據
        if (!data || Object.keys(data).length === 0) {
            resultContent.html('<div class="alert alert-info">沒有找到相關標籤</div>');
            return;
        }
        
        // 獲取所有標籤名稱
        const tagNames = Object.keys(data);
        
        if (tagNames.length === 0) {
            resultContent.html('<div class="alert alert-info">沒有找到相關標籤</div>');
            return;
        }
        
        // 創建標籤列表容器
        const tagListContainer = $('<div class="tag-list-container"></div>');
        
        // 添加標題和複製按鈕
        const headerDiv = $('<div class="d-flex justify-content-between align-items-center mb-3"></div>');
        headerDiv.append('<h2 class="mb-0">萃取出的標籤</h2>');
        headerDiv.append('<button id="copyTagsBtn" class="btn btn-success"><i class="bi bi-clipboard"></i> 複製所有標籤</button>');
        tagListContainer.append(headerDiv);
        
        // 創建標籤列表
        const tagList = $('<div class="tag-list"></div>');
        
        // 添加每個標籤
        tagNames.forEach(tagName => {
            tagList.append(`<span class="tag-item">${tagName}</span>`);
        });
        
        // 將標籤列表添加到容器
        tagListContainer.append(tagList);
        
        // 將容器添加到結果內容
        resultContent.append(tagListContainer);
        
        // 隱藏的文本區域，用於複製
        const hiddenTextarea = $('<textarea id="hiddenCopyArea" style="position: absolute; left: -9999px;"></textarea>');
        hiddenTextarea.val(tagNames.join(', '));
        resultContent.append(hiddenTextarea);
        
        // 綁定複製按鈕事件
        $("#copyTagsBtn").on("click", function() {
            copyTags(tagNames);
        });
    }
    
    // 複製標籤的函數
    function copyTags(tagNames) {
        // 獲取隱藏的文本區域
        const hiddenCopyArea = $("#hiddenCopyArea");
        
        // 選擇文本
        hiddenCopyArea.select();
        
        try {
            // 執行複製命令
            const successful = document.execCommand('copy');
            
            if (successful) {
                // 顯示成功提示
                const originalText = $("#copyTagsBtn").html();
                $("#copyTagsBtn").html('<i class="bi bi-check"></i> 已複製！');
                $("#copyTagsBtn").removeClass('btn-success').addClass('btn-info');
                
                // 3秒後恢復按鈕文字
                setTimeout(function() {
                    $("#copyTagsBtn").html(originalText);
                    $("#copyTagsBtn").removeClass('btn-info').addClass('btn-success');
                }, 2000);
            } else {
                alert("複製失敗，請手動複製");
            }
        } catch (err) {
            alert("複製失敗，請手動複製");
            console.error('無法複製文本: ', err);
        }
    }
});

// Google登入回調函數（必須是全局函數）
function handleCredentialResponse(response) {
    // 獲取ID令牌
    const token = response.credential;
    
    // 驗證令牌
    $.ajax({
        url: "/api/verify-google-token",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            token: token
        }),
        success: function(response) {
            // 保存用戶令牌和信息
            localStorage.setItem('userToken', token);
            localStorage.setItem('userInfo', JSON.stringify(response));
            
            // 刷新頁面
            location.reload();
        },
        error: function(xhr, status, error) {
            console.error("Google登入失敗:", error);
            alert("Google登入失敗，請稍後再試");
        }
    });
}