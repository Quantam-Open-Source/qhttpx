import { useEffect, useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await api.get('/todos');
      setTodos(res.data);
    } catch (err) {
      navigate('/login');
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo) return;
    await api.post('/todos', { title: newTodo });
    setNewTodo('');
    fetchTodos();
  };

  const toggle = async (todo: Todo) => {
    await api.put(`/todos/${todo.id}`, { completed: !todo.completed });
    fetchTodos();
  };

  const remove = async (id: number) => {
    await api.delete(`/todos/${id}`);
    fetchTodos();
  };
  
  const logout = () => {
      localStorage.removeItem('token');
      navigate('/login');
  }

  return (
    <div className="container">
      <header>
          <h2>My Todos</h2>
          <button onClick={logout}>Logout</button>
      </header>
      
      <form onSubmit={add}>
        <input value={newTodo} onChange={e => setNewTodo(e.target.value)} placeholder="New Task..." />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map(t => (
          <li key={t.id}>
            <span 
                onClick={() => toggle(t)} 
                style={{
                    cursor: 'pointer', 
                    textDecoration: t.completed ? 'line-through' : 'none',
                    flexGrow: 1
                }}
            >
                {t.title}
            </span>
            <button onClick={() => remove(t.id)}>x</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
