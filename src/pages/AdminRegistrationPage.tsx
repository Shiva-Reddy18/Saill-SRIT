import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page } from '../types';
import { AuthService } from '../services/AuthService';
import {
  ShieldCheck,
  Lock,
  User,
  Building2,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  Server
} from 'lucide-react';

interface AdminRegistrationPageProps {
  onNavigate: (page: Page) => void;
}

export const AdminRegistrationPage: React.FC<AdminRegistrationPageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobile: '',
    employeeId: 'EMP-SRIT-ADMIN01',
    username: 'ADMIN01',
    department: 'System Administration & Institutional Governance',
    designation: 'System Administrator & Lab In-Charge',
    password: '',
    confirmPassword: '',
    institutionName: 'Srinivasa Ramanujan Institute of Technology',
    institutionShortName: 'SRIT'
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [adminAlreadyExists, setAdminAlreadyExists] = useState(false);

  // Check if an admin is already registered in the central database
  useEffect(() => {
    let isMounted = true;
    const verifyStatus = async () => {
      try {
        const status = await AuthService.checkAdminStatus();
        if (isMounted) {
          if (status.hasAdmin) {
            setAdminAlreadyExists(true);
            setErrorMsg(
              'An administrator account is already registered in the central database. Public Admin Registration is permanently disabled.'
            );
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || 'Error connecting to central database. Please check connection.');
        }
      } finally {
        if (isMounted) {
          setIsCheckingStatus(false);
        }
      }
    };
    verifyStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errorMsg && !adminAlreadyExists) setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(
      'Public administrator registration is disabled. Provision an administrator through the trusted Supabase SQL process documented in the developer guide.'
    );
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#D35400] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-[#2C3E50]">Verifying Central Database Deployment Status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FFF8F0] via-white to-[#FFF8F0]">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white p-6 sm:p-10 rounded-3xl border-2 border-[#FAD7A0] shadow-xl relative"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#FAD7A0]">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#5D6D7E] hover:text-[#D35400] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FFF8F0] border border-[#FAD7A0] rounded-full text-[11px] font-extrabold text-[#D35400]">
            <Server className="w-3.5 h-3.5" />
            <span>Central Database Deployment</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-2 pt-6">
          <div className="w-16 h-16 bg-gradient-to-br from-[#D35400] to-[#E67E22] text-white rounded-2xl flex items-center justify-center mx-auto shadow-md font-black">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#2C3E50] font-heading tracking-tight">
            Institutional Administrator Registration
          </h1>
          <p className="text-xs sm:text-sm text-[#5D6D7E] max-w-md mx-auto">
            Permanent centralized account setup for the SAILL R26 Communicative English Laboratory.
          </p>
        </div>

        {/* Locked / Already Registered Banner */}
        {adminAlreadyExists ? (
          <div className="mt-8 p-6 bg-[#FAD7A0]/20 border-2 border-[#D35400] rounded-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-[#D35400] rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#2C3E50]">Public Admin Registration Disabled</h3>
              <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
                An administrator account has already been registered in the central database. For security reasons,
                further administrator accounts cannot be created publicly.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => onNavigate('login')}
                className="px-6 py-2.5 bg-[#D35400] text-white font-extrabold text-xs rounded-xl hover:bg-[#E67E22] transition shadow-md cursor-pointer"
              >
                Proceed to Admin Login
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
              Administrator accounts can only be provisioned by a trusted operator in Supabase. This public form cannot grant administrator privileges.
            </div>
            {/* Error Notification */}
            {errorMsg && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="font-semibold whitespace-pre-line">{errorMsg}</div>
              </div>
            )}

            {/* Section 1: Administrator Profile */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <User className="w-4 h-4 text-[#D35400]" />
                <h3 className="text-xs font-black text-[#2C3E50] uppercase tracking-wider">
                  Administrator Profile Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    required
                    value={formData.fullName || ''}
                    onChange={handleChange}
                    placeholder="e.g., Prof. K. Ramesh Rao"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Institutional Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email || ''}
                    onChange={handleChange}
                    placeholder="e.g., admin@srit.ac.in"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Mobile Number <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    name="mobile"
                    value={formData.mobile || ''}
                    onChange={handleChange}
                    placeholder="e.g., +91 98765 43210"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Employee / Staff ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="employeeId"
                    required
                    value={formData.employeeId || ''}
                    onChange={handleChange}
                    placeholder="e.g., EMP-SRIT-ADMIN01"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Admin Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="username"
                    required
                    value={formData.username || ''}
                    onChange={handleChange}
                    placeholder="e.g., ADMIN01"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department || ''}
                    onChange={handleChange}
                    placeholder="e.g., System Administration & Governance"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Security & Password */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <KeyRound className="w-4 h-4 text-[#D35400]" />
                <h3 className="text-xs font-black text-[#2C3E50] uppercase tracking-wider">
                  Admin Credentials (Hashed on Server)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Master Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      required
                      minLength={6}
                      value={formData.password || ''}
                      onChange={handleChange}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3.5 py-2.5 pr-10 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      required
                      minLength={6}
                      value={formData.confirmPassword || ''}
                      onChange={handleChange}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2.5 pr-10 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Institution Profile */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Building2 className="w-4 h-4 text-[#D35400]" />
                <h3 className="text-xs font-black text-[#2C3E50] uppercase tracking-wider">
                  Institution Context
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">Institution Name</label>
                  <input
                    type="text"
                    name="institutionName"
                    value={formData.institutionName || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#2C3E50] mb-1">Short Code</label>
                  <input
                    type="text"
                    name="institutionShortName"
                    value={formData.institutionShortName || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#FFF8F0]/30 border border-[#FAD7A0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D35400] text-[#2C3E50] font-medium uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-[#FAD7A0]">
              <button
                type="submit"
                disabled
                className="w-full py-3.5 px-6 bg-gray-400 text-white font-extrabold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>Public administrator registration is disabled</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default AdminRegistrationPage;
