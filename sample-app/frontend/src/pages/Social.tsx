import { useState, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';

interface Post {
    id: string;
    content: string;
    likes: number;
    createdAt: string;
    user: {
        email: string;
    };
}

export default function Social() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [content, setContent] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const query = `
                query {
                    posts {
                        id
                        content
                        likes
                        createdAt
                        user { email }
                    }
                }
            `;
            const res = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const json = await res.json();
            if (json.errors) {
                throw new Error(json.errors[0].message);
            }
            if (json.data) setPosts(json.data.posts);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePost = async () => {
        if (!content.trim()) return;
        
        const query = `
            mutation($content: String!) {
                createPost(content: $content) {
                    id
                }
            }
        `;
        const token = localStorage.getItem('token');
        await fetch('/graphql', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query, variables: { content } })
        });
        setContent('');
        fetchPosts();
    };

    const handleLike = async (id: string) => {
        const query = `
            mutation($id: ID!) {
                likePost(id: $id) {
                    likes
                }
            }
        `;
         await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { id } })
        });
        fetchPosts();
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <h1>Social Feed 🐦</h1>
            
            <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '10px', marginBottom: '20px', background: 'white' }}>
                <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What's happening?"
                    style={{ width: '100%', height: '80px', marginBottom: '10px', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowPicker(!showPicker)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5em' }}>
                            😊
                        </button>
                        {showPicker && (
                            <div style={{ position: 'absolute', top: '40px', zIndex: 10 }}>
                                <EmojiPicker onEmojiClick={(e) => {
                                    setContent(prev => prev + e.emoji);
                                    setShowPicker(false);
                                }} />
                            </div>
                        )}
                    </div>
                    <button onClick={handlePost} style={{ background: '#1da1f2', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Tweet
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {loading && <p>Loading posts...</p>}
                {error && <p style={{ color: 'red' }}>Error: {error}</p>}
                {!loading && !error && posts.length === 0 && <p>No posts yet. Be the first to share something!</p>}
                {posts.map(post => (
                    <div key={post.id} style={{ border: '1px solid #eee', padding: '15px', borderRadius: '10px', background: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontWeight: 'bold' }}>{post.user.email}</span>
                            <span style={{ color: '#888', fontSize: '0.9em' }}>
                                {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <div style={{ fontSize: '1.2em', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>{post.content}</div>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <button onClick={() => handleLike(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0245e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                ❤️ {post.likes}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
