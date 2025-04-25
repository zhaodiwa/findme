## 本地智能文件搜索系统
# 文件：main.py

import os
import faiss
import pickle
from typing import List
from sentence_transformers import SentenceTransformer
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import UnstructuredFileLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from fastapi import FastAPI, Query
from pydantic import BaseModel
import uvicorn
import pytesseract
from PIL import Image

# 设置路径
DOC_DIR = "./docs"
DB_PATH = "./vector_store"
MODEL_NAME = "/Users/zhaozdw/workspace/findme/src/models/all-MiniLM-L6-v2/"
# 初始化嵌入模型
embedding_model = HuggingFaceEmbeddings(model_name=MODEL_NAME)

# 图片 OCR 识别函数
def extract_text_from_image(image_path: str) -> str:
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image, lang="chi_sim+eng")
        return text
    except Exception as e:
        print(f"OCR failed on {image_path}: {e}")
        return ""

# 加载或创建向量数据库
def build_vector_db():
    documents = []
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    for root, _, files in os.walk(DOC_DIR):
        for file in files:
            path = os.path.join(root, file)
            if file.endswith((".txt", ".pdf", ".docx")):
                loader = UnstructuredFileLoader(path)
                docs = loader.load()
                docs_split = splitter.split_documents(docs)
                for doc in docs_split:
                    doc.metadata["source"] = path
                documents.extend(docs_split)
            elif file.lower().endswith((".png", ".jpg", ".jpeg")):
                text = extract_text_from_image(path)
                if text.strip():
                    from langchain.schema import Document
                    doc = Document(page_content=text, metadata={"source": path})
                    documents.append(doc)
    db = FAISS.from_documents(documents, embedding_model)
    db.save_local(DB_PATH)
    return db

# 如果向量库已存在则加载
if os.path.exists(DB_PATH):
    db = FAISS.load_local(DB_PATH, embedding_model)
else:
    db = build_vector_db()

# 创建 API 应用
app = FastAPI()

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5

@app.post("/search")
def search_files(request: QueryRequest):
    results = db.similarity_search(request.query, k=request.top_k)
    return [
        {
            "content": r.page_content,
            "file": r.metadata.get("source", "unknown")
        }
        for r in results
    ]

# 启动 API
if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
