$(document).ready(function() {
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
        
        // 發送API請求
        $.ajax({
            url: "http://localhost:8000/api/extract-tags",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                content: content
            }),
            success: function(response) {
                // 隱藏加載動畫
                $("#loadingSpinner").hide();
                
                // 顯示結果
                displayResults(response);
            },
            error: function(xhr, status, error) {
                // 隱藏加載動畫
                $("#loadingSpinner").hide();
                
                // 顯示錯誤信息
                $("#resultContent").html(
                    `<div class="error-message">
                        <h4>發生錯誤</h4>
                        <p>${xhr.responseText || "請求失敗，請稍後再試"}</p>
                    </div>`
                );
            }
        });
    });
    
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