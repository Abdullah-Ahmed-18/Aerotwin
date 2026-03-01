'use client';

import { ChevronDown, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface StationSettings {
    staffing: string;
    avgServiceTime: string;
    maxQueue: string;
    experience: string;
    allowedClass: string[];
    hasXRayScanner: boolean;
}

interface StationProps {
    id: string;
    name: string;
    checkpointType?: string;
    settings?: StationSettings;
    onSettingsChange?: (settings: StationSettings) => void;
    onDelete?: () => void;
}

export default function StationCard({ id, name, checkpointType, settings, onSettingsChange, onDelete }: StationProps) {
    const [localSettings, setLocalSettings] = useState<StationSettings>(
        settings || {
            staffing: '',
            avgServiceTime: '',
            maxQueue: '',
            experience: 'Experienced',
            allowedClass: ['All Classes'],
            hasXRayScanner: false
        }
    );
    const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
    const isSecurity = checkpointType === 'Security';

    const classOptions = ['All Classes', 'Business', 'Economy', 'PRM', 'First Class', 'VIP'];

    // Update local settings when prop changes (for "apply to all" functionality)
    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (isClassDropdownOpen) {
                setIsClassDropdownOpen(false);
            }
        };

        if (isClassDropdownOpen) {
            document.addEventListener('click', handleClickOutside);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [isClassDropdownOpen]);

    const updateSetting = (key: keyof StationSettings, value: string | boolean | string[]) => {
        const newSettings = { ...localSettings, [key]: value };
        setLocalSettings(newSettings);
        if (onSettingsChange) {
            onSettingsChange(newSettings);
        }
    };

    const toggleClassOption = (option: string) => {
        let newClasses: string[];

        if (option === 'All Classes') {
            // If selecting "All Classes", replace with just that
            newClasses = ['All Classes'];
        } else {
            // Remove "All Classes" if it exists and we're selecting a specific class
            const currentClasses = localSettings.allowedClass.filter(c => c !== 'All Classes');

            if (currentClasses.includes(option)) {
                // Deselect the option
                newClasses = currentClasses.filter(c => c !== option);
                // If nothing selected, default to "All Classes"
                if (newClasses.length === 0) {
                    newClasses = ['All Classes'];
                }
            } else {
                // Add the option
                newClasses = [...currentClasses, option];
            }
        }

        updateSetting('allowedClass', newClasses);
    };
    return (
        <div className="bg-slate-50 rounded p-2 border border-slate-200">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00D084]" />
                    <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">{id}</span>
                    <span className="text-[11px] font-bold text-slate-800">{name}</span>
                </div>
                {onDelete && (
                    <Trash2
                        size={12}
                        className="cursor-pointer text-slate-300 hover:text-red-500 flex-shrink-0"
                        onClick={onDelete}
                    />
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Number of Staff</label>
                    <input
                        type="text"
                        value={localSettings.staffing}
                        onChange={(e) => updateSetting('staffing', e.target.value)}
                        className="bg-white border border-slate-200 rounded px-1.5 h-6 text-[11px] text-slate-700 outline-none"
                        placeholder="3"
                    />
                </div>

                <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Avg Svc Time</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={localSettings.avgServiceTime}
                            onChange={(e) => updateSetting('avgServiceTime', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded pl-1.5 pr-6 h-6 text-[11px] text-slate-700 outline-none"
                            placeholder="45"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 pointer-events-none">sec</span>
                    </div>
                </div>

                <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Max Queue</label>
                    <input
                        type="text"
                        value={localSettings.maxQueue}
                        onChange={(e) => updateSetting('maxQueue', e.target.value)}
                        className="bg-white border border-slate-200 rounded px-1.5 h-6 text-[11px] text-slate-700 outline-none"
                        placeholder="50"
                    />
                </div>

                {localSettings.staffing !== '0' && (
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Staffing Experience</label>
                        <div className="relative">
                            <select
                                value={localSettings.experience}
                                onChange={(e) => updateSetting('experience', e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded pl-1.5 pr-5 h-6 text-[11px] text-slate-700 appearance-none outline-none"
                            >
                                <option>Veteran</option>
                                <option>Experienced</option>
                                <option>In Training</option>
                            </select>
                            <ChevronDown size={8} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                        </div>
                    </div>
                )}

                <div className="col-span-2 flex flex-col gap-0.5">
                    <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Allowed Class</label>
                    <div className="relative">
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsClassDropdownOpen(!isClassDropdownOpen);
                            }}
                            className="w-full bg-white border border-slate-200 rounded pl-1.5 pr-5 h-6 text-[11px] text-slate-700 cursor-pointer flex items-center"
                        >
                            <span className="truncate">
                                {localSettings.allowedClass.join(', ')}
                            </span>
                        </div>
                        <ChevronDown size={8} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />

                        {isClassDropdownOpen && (
                            <div
                                className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {classOptions.map((option) => (
                                    <label
                                        key={option}
                                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleClassOption(option);
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={localSettings.allowedClass.includes(option)}
                                            onChange={() => { }} // Handled by label click
                                            className="w-3 h-3 text-[#1ED5F4] bg-white border-slate-300 rounded focus:ring-[#1ED5F4] focus:ring-1 cursor-pointer"
                                        />
                                        <span className="text-[11px] text-slate-700">{option}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {isSecurity && (
                    <div className="col-span-2 flex items-left gap-2 pt-0.5 flex-col">
                        <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Additional Attributes</label>
                        <div className="flex items-center gap-4">
                        <input
                            type="checkbox"
                            id={`xray-${id}`}
                            checked={localSettings.hasXRayScanner}
                            onChange={(e) => updateSetting('hasXRayScanner', e.target.checked)}
                            className="w-3.5 h-3.5 text-[#1ED5F4] bg-white border-slate-300 rounded focus:ring-[#1ED5F4] focus:ring-1 cursor-pointer"
                        />
                        <label htmlFor={`xray-${id}`} className="text-[11px] text-slate-700 cursor-pointer">
                            X Ray Scanner
                        </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}