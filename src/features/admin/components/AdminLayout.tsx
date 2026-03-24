import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, Menu, X, User } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';

export const AdminLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) => 
    `w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
      isActive 
        ? 'bg-orange-600 text-white' 
        : 'hover:bg-slate-800 hover:text-white'
    }`;

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center gap-4 px-4 py-4 rounded-xl text-lg font-medium transition-all ${
      isActive 
        ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' 
        : 'text-slate-300 hover:bg-slate-800'
    }`;

  return (
    <div className="flex h-screen bg-background text-foreground font-sans transition-colors duration-200">
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm md:hidden animate-in fade-in duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <span className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">B</span>
                B-VIVO
              </span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)} 
                className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <nav className="flex-1 p-6 space-y-4 overflow-y-auto">
              <NavLink to="/admin" end className={mobileNavLinkClass} onClick={() => setIsMobileMenuOpen(false)}>
                <LayoutDashboard size={24} />
                Overview
              </NavLink>
              
              <div className="pt-4 pb-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Organization</div>
              
              <NavLink to="/admin/players" className={mobileNavLinkClass} onClick={() => setIsMobileMenuOpen(false)}>
                <Users size={24} />
                Players & KYC
              </NavLink>

              <NavLink to="/dashboard" className={mobileNavLinkClass} onClick={() => setIsMobileMenuOpen(false)}>
                <User size={24} />
                User CRM (Player View)
              </NavLink>
              
              <div className="pt-4 pb-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-widest">System</div>
              
              <NavLink to="/admin/octagon" className={mobileNavLinkClass} onClick={() => setIsMobileMenuOpen(false)}>
                <Settings size={24} />
                Octagon Content
              </NavLink>

              <NavLink to="/admin/settings" className={mobileNavLinkClass} onClick={() => setIsMobileMenuOpen(false)}>
                <LayoutDashboard size={24} />
                Legal & Config
              </NavLink>
            </nav>

            <div className="p-6 border-t border-slate-700">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-lg font-medium text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all"
              >
                <LogOut size={24} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-900 dark:bg-black text-slate-300 hidden md:flex flex-col flex-shrink-0 transition-all">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">B</span>
            B-VIVO
          </h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Tournament Admin</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto no-scrollbar">
          <NavLink to="/admin" end className={navLinkClass}>
            <LayoutDashboard size={20} />
            Overview
          </NavLink>
          
          <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase">Organization</div>
          <NavLink to="/admin/players" className={navLinkClass}>
            <Users size={20} />
            Players & KYC
          </NavLink>

          <NavLink to="/dashboard" className={navLinkClass}>
             <User size={20} />
             User CRM (Player View)
          </NavLink>
          
          <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase">System</div>
          <NavLink to="/admin/octagon" className={navLinkClass}>
            <Settings size={20} />
            Octagon Content
          </NavLink>
          <NavLink to="/admin/settings" className={navLinkClass}>
            <LayoutDashboard size={20} />
            Legal & Config
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex justify-between items-center md:hidden">
           <div className="flex items-center gap-3">
             <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 text-foreground hover:text-primary transition-colors">
               <Menu size={24} />
             </button>
             <h1 className="text-lg font-bold text-foreground">B-VIVO Admin</h1>
           </div>
           <button onClick={handleLogout} className="p-2 text-rose-500 hover:text-rose-600 transition-colors"><LogOut size={20} /></button>
        </header>

        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
