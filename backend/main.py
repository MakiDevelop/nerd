from fastapi import FastAPI, Request, Depends, HTTPException, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import logging
import jwt
from datetime import datetime, timedelta
import time
from fastapi.security import OAuth2PasswordBearer
import redis
import os

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

# 連接Redis用於存儲使用次數
redis_host = os.environ.get("REDIS_HOST", "redis")
redis_port = int(os.environ.get("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

# 定義請求模型
class TagExtractRequest(BaseModel):
    content: str

# 定義Google令牌驗證請求
class GoogleTokenVerifyRequest(BaseModel):
    token: str

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

# 使用限制
ANONYMOUS_LIMIT = 3  # 未登入用戶每天限制
LOGGED_IN_LIMIT = 10  # 已登入用戶每天限制

# Google OAuth2 Client ID
GOOGLE_CLIENT_ID = "409546408192-0tnl76ogth01o5vg31a6s7v0bqebb89d.apps.googleusercontent.com"

# 驗證Google令牌
async def verify_google_token(token: str) -> dict:
    try:
        # 使用Google API驗證令牌
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.error(f"Google令牌驗證失敗: {response.text}")
                return None
            
            token_info = response.json()
            
            # 驗證客戶端ID
            if token_info.get("aud") != GOOGLE_CLIENT_ID:
                logger.error(f"Google令牌客戶端ID不匹配: {token_info.get('aud')}")
                return None
            
            return token_info
    except Exception as e:
        logger.exception(f"驗證Google令牌時發生錯誤: {str(e)}")
        return None

# 獲取用戶ID（從令牌或IP地址）
async def get_user_id(authorization: Optional[str] = Header(None), request: Request = None):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        token_info = await verify_google_token(token)
        
        if token_info:
            return f"user:{token_info.get('sub')}"  # 使用Google用戶ID
    
    # 如果沒有有效的令牌，使用IP地址
    client_ip = request.client.host
    return f"anon:{client_ip}"

# 檢查使用次數限制
async def check_usage_limit(user_id: str):
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"usage:{user_id}:{today}"
    
    # 獲取當前使用次數
    usage = redis_client.get(key)
    usage = int(usage) if usage else 0
    
    # 檢查是否已登入用戶
    is_logged_in = user_id.startswith("user:")
    limit = LOGGED_IN_LIMIT if is_logged_in else ANONYMOUS_LIMIT
    
    if usage >= limit:
        logger.warning(f"用戶 {user_id} 已超出使用限制")
        return False
    
    return True

# 增加使用次數
async def increment_usage(user_id: str):
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"usage:{user_id}:{today}"
    
    # 增加使用次數
    redis_client.incr(key)
    
    # 設置過期時間（24小時）
    redis_client.expire(key, 86400)

@app.post("/api/verify-google-token")
async def verify_token(request: GoogleTokenVerifyRequest):
    """
    驗證Google令牌
    """
    token_info = await verify_google_token(request.token)
    
    if not token_info:
        return JSONResponse(
            status_code=401,
            content={"message": "無效的令牌"}
        )
    
    return {
        "user_id": token_info.get("sub"),
        "email": token_info.get("email"),
        "name": token_info.get("name"),
        "picture": token_info.get("picture")
    }

@app.get("/api/usage")
async def get_usage(request: Request, user_id: str = Depends(get_user_id)):
    """
    獲取用戶使用次數
    """
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"usage:{user_id}:{today}"
    
    # 獲取當前使用次數
    usage = redis_client.get(key)
    usage = int(usage) if usage else 0
    
    # 檢查是否已登入用戶
    is_logged_in = user_id.startswith("user:")
    limit = LOGGED_IN_LIMIT if is_logged_in else ANONYMOUS_LIMIT
    
    return {
        "usage": usage,
        "limit": limit,
        "remaining": max(0, limit - usage),
        "is_logged_in": is_logged_in
    }

@app.post("/api/extract-tags")
async def extract_tags(request: TagExtractRequest, req: Request, user_id: str = Depends(get_user_id)):
    """
    從文本中萃取標籤
    """
    try:
        # 檢查使用次數限制
        if not await check_usage_limit(user_id):
            return JSONResponse(
                status_code=429,
                content={
                    "message": "已超出今日使用限制",
                    "contact": "想增加查詢次數或想進行API租用／客製化，請連絡 makiakatsu@gmail.com"
                }
            )
        
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
                # 增加使用次數
                await increment_usage(user_id)
                
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