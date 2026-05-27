# Quick Start: Adding Vector Search

This guide shows you how to add semantic search to your meeting transcripts in ~30 minutes.

## What You'll Get

Search like this:
```
"What did we say about pricing?" → Finds all pricing discussions
"Technical issues Evan mentioned" → Finds Evan's technical concerns
"Action items from last week" → Extracts todos across meetings
```

---

## Installation

### 1. Install Dependencies

```bash
cd backend
source venv/bin/activate
pip install chromadb sentence-transformers
```

**Packages:**
- `chromadb`: Vector database (local, free)
- `sentence-transformers`: Embeddings (local, free)

**Download size:** ~500MB (first run downloads model)

---

## 2. Create Vector Search Module

Create `backend/vector_search.py`:

```python
import chromadb
from sentence_transformers import SentenceTransformer
from pathlib import Path
import json
from datetime import datetime

# Initialize
client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(name="meeting_transcripts")
model = SentenceTransformer('all-MiniLM-L6-v2')  # Fast, free embedding model

def embed_transcript(filename, transcript_text, metadata=None):
    """
    Add a transcript to the vector database.
    
    Args:
        filename: e.g., "2026-05-27-1011-aaa.md"
        transcript_text: Full transcript text
        metadata: Optional dict with date, participants, etc.
    """
    # Create embedding
    embedding = model.encode(transcript_text).tolist()
    
    # Extract date from filename
    parts = filename.split('-')
    date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
    
    # Store in ChromaDB
    collection.add(
        documents=[transcript_text],
        embeddings=[embedding],
        metadatas=[{
            "filename": filename,
            "date": date_str,
            "length": len(transcript_text),
            **(metadata or {})
        }],
        ids=[filename]
    )
    print(f"✅ Embedded: {filename}")

def search_transcripts(query, n_results=5):
    """
    Semantic search across all transcripts.
    
    Args:
        query: Natural language question
        n_results: How many results to return
    
    Returns:
        List of (filename, text_snippet, score)
    """
    # Create query embedding
    query_embedding = model.encode(query).tolist()
    
    # Search
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results
    )
    
    # Format results
    output = []
    for i in range(len(results['ids'][0])):
        output.append({
            'filename': results['metadatas'][0][i]['filename'],
            'date': results['metadatas'][0][i]['date'],
            'snippet': results['documents'][0][i][:500] + "...",  # First 500 chars
            'distance': results['distances'][0][i] if 'distances' in results else None
        })
    
    return output

def embed_all_from_github(repo_owner="dataappengineer", repo_name="ctrl-shift-call-transcripts"):
    """
    Download and embed all transcripts from GitHub.
    """
    from github import Github
    import os
    
    token = os.getenv("GITHUB_TOKEN")
    g = Github(token)
    repo = g.get_repo(f"{repo_owner}/{repo_name}")
    
    # Get all files in transcripts/
    contents = repo.get_contents("transcripts")
    
    for file in contents:
        if file.name.endswith('.md'):
            # Download content
            content = file.decoded_content.decode('utf-8')
            
            # Extract transcript text (skip markdown headers)
            lines = content.split('\n')
            transcript_start = None
            for i, line in enumerate(lines):
                if line.startswith('## Transcript'):
                    transcript_start = i + 1
                    break
            
            if transcript_start:
                transcript_text = '\n'.join(lines[transcript_start:])
            else:
                transcript_text = content
            
            # Embed
            embed_transcript(file.name, transcript_text)
    
    print(f"\n✅ Embedded {len(contents)} transcripts")

# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "sync":
        # Download and embed all from GitHub
        print("📥 Syncing transcripts from GitHub...")
        embed_all_from_github()
    
    elif len(sys.argv) > 1:
        # Search
        query = ' '.join(sys.argv[1:])
        print(f"\n🔍 Searching for: '{query}'\n")
        
        results = search_transcripts(query)
        
        for i, result in enumerate(results, 1):
            print(f"{i}. {result['filename']} ({result['date']})")
            print(f"   {result['snippet']}")
            print()
    
    else:
        print("Usage:")
        print("  python vector_search.py sync              # Download all transcripts")
        print("  python vector_search.py 'pricing'         # Search for pricing")
        print("  python vector_search.py 'what Evan said'  # Search for Evan")
```

---

## 3. Sync Your Transcripts

```bash
cd backend
python vector_search.py sync
```

**Output:**
```
📥 Syncing transcripts from GitHub...
✅ Embedded: 2026-05-26-2229-tttt.md
✅ Embedded: 2026-05-27-1011-aaa.md
✅ Embedded 2 transcripts
```

**This creates:** `backend/chroma_db/` folder (don't commit to git!)

---

## 4. Try Searching

```bash
# Search for pricing discussions
python vector_search.py "pricing"

# Search for technical issues
python vector_search.py "technical problems"

# Search for what Evan said
python vector_search.py "Evan mentioned"

# Search for action items
python vector_search.py "need to do" "action items"
```

**Example output:**
```
🔍 Searching for: 'pricing'

1. 2026-05-27-1011-aaa.md (2026-05-27)
   We talked about pricing strategy. They're paying $180
   per employee per year and think it's too expensive...

2. 2026-05-26-2229-tttt.md (2026-05-26)
   Budget: $50-75 per employee per year...
```

---

## 5. Integrate with Flask Server

Add to `backend/transcription_server.py`:

```python
from vector_search import embed_transcript

# In the transcribe_and_commit function, after GitHub commit:

# Embed the transcript for semantic search
try:
    logger.info("Embedding transcript for search...")
    embed_transcript(filename, transcript_text, {
        "title": title,
        "duration": duration
    })
    logger.info("✅ Transcript embedded")
except Exception as e:
    logger.warning(f"⚠️ Embedding failed: {e}")
    # Non-fatal, continue
```

**Now:** Every recording is automatically searchable!

---

## 6. Build a Simple Search UI (Optional)

Create `backend/search_api.py`:

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from vector_search import search_transcripts

app = Flask(__name__)
CORS(app)

@app.route('/search', methods=['POST'])
def search():
    query = request.json.get('query', '')
    n_results = request.json.get('n_results', 5)
    
    if not query:
        return jsonify({"error": "No query provided"}), 400
    
    results = search_transcripts(query, n_results)
    return jsonify({"results": results})

if __name__ == '__main__':
    app.run(port=5001, debug=True)
```

Run it:
```bash
python search_api.py
```

Test with curl:
```bash
curl -X POST http://localhost:5001/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pricing", "n_results": 3}'
```

---

## 7. Chrome Extension Integration (Future)

Add a search popup to your extension:

```html
<!-- extension/search.html -->
<input type="text" id="searchQuery" placeholder="Search your meetings...">
<button id="searchBtn">Search</button>
<div id="results"></div>
```

```javascript
// extension/search.js
document.getElementById('searchBtn').addEventListener('click', async () => {
  const query = document.getElementById('searchQuery').value;
  
  const response = await fetch('http://localhost:5001/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  
  const data = await response.json();
  displayResults(data.results);
});
```

---

## Performance Notes

**ChromaDB (Local):**
- ✅ Free
- ✅ Fast for <1000 meetings
- ✅ Privacy (local storage)
- ❌ No cloud sync
- ❌ Single machine only

**When to upgrade to Qdrant:**
- \>1000 meetings
- Multiple users
- Need cloud access
- Want better performance

**Migration path:**
```python
# Export from ChromaDB
data = collection.get()

# Import to Qdrant
from qdrant_client import QdrantClient
qdrant = QdrantClient(url="your-qdrant-url")
qdrant.upsert(collection_name="meetings", points=data)
```

---

## Cost Comparison

| Approach | Cost | Speed | Use Case |
|----------|------|-------|----------|
| **ChromaDB (local)** | $0 | Fast | Personal use, MVP |
| **Qdrant (Railway)** | $25/mo | Very fast | Team, production |
| **Pinecone** | $70/mo | Fastest | Enterprise |

**Recommendation:** Start with ChromaDB, upgrade when you have >500 meetings or >5 users.

---

## Next Steps

1. **Run the sync** to embed your existing transcripts
2. **Try searches** to see what works
3. **Think about queries** you want to answer
4. **Build UI** if you want visual search

**The killer feature:** "Show me all the times we discussed X across all meetings" - this is what Granola doesn't have!
