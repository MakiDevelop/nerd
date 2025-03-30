from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx
import logging

# 設置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="標籤萃取API")

# 允許跨域請求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生產環境中應該限制為您的前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 定義請求模型
class TagExtractRequest(BaseModel):
    content: str

# 實際API的端點
API_URL = "https://nerdpoc.pixnet.cc/cooperateapi/api/extract_tags_by_list"

# 預設使用的站點列表
DEFAULT_SITES = [
    "pixnet",
    "pixnet_extract",
    "mombaby",
    "mombaby_extract",
    "techbang",
    "techbang_extract"
]

@app.post("/api/extract-tags")
async def extract_tags(request: TagExtractRequest):
    """
    從文本中萃取標籤
    """
    try:
        # 準備發送到實際API的數據
        payload = {
            "content": [request.content],
            "site_list": DEFAULT_SITES
        }
        
        # 設置請求頭
        headers = {
            "Content-Type": "application/json"
        }
        
        logger.info(f"發送請求到API: {API_URL}")
        logger.info(f"請求數據: {payload}")
        
        # 調用實際API
        async with httpx.AsyncClient() as client:
            response = await client.post(API_URL, json=payload, headers=headers)
            
            # 檢查響應狀態
            if response.status_code == 200:
                # 獲取API響應數據
                api_response = response.json()
                logger.info(f"API響應: {api_response}")
                
                # 處理響應數據
                if "data" in api_response and len(api_response["data"]) > 0:
                    # 獲取data數組的第一個元素
                    first_result = api_response["data"][0]
                    logger.info(f"處理後的結果: {first_result}")
                    
                    # 返回第一個結果
                    return first_result
                else:
                    logger.warning("API響應中沒有data字段或data數組為空")
                    return {}
            else:
                logger.error(f"API請求失敗: {response.status_code} - {response.text}")
                return JSONResponse(
                    status_code=response.status_code,
                    content={"message": f"API請求失敗: {response.text}"}
                )
    
    except Exception as e:
        logger.exception(f"處理請求時發生錯誤: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"message": f"服務器錯誤: {str(e)}"}
        )

@app.get("/")
async def root():
    return {"message": "標籤萃取API服務正在運行"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)