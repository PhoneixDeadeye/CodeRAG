import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height,
    animation = 'pulse'
}) => {
    const baseClasses = 'bg-border-dark';
    
    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg'
    };
    
    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'animate-shimmer',
        none: ''
    };
    
    const style: React.CSSProperties = {
        width: width,
        height: height
    };
    
    return (
        <div 
            className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
            style={style}
        />
    );
};

// Pre-built skeleton patterns
export const MessageSkeleton: React.FC = () => (
    <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex gap-4">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-3">
                <Skeleton height={16} width="30%" />
                <Skeleton height={80} />
                <Skeleton height={16} width="60%" />
            </div>
        </div>
    </div>
);

export const FileTreeSkeleton: React.FC = () => (
    <div className="p-4 space-y-2 animate-fade-in">
        <Skeleton height={24} width="80%" />
        <div className="pl-4 space-y-2">
            <Skeleton height={20} width="70%" />
            <Skeleton height={20} width="60%" />
            <Skeleton height={20} width="75%" />
        </div>
        <Skeleton height={24} width="65%" />
        <div className="pl-4 space-y-2">
            <Skeleton height={20} width="55%" />
            <Skeleton height={20} width="70%" />
        </div>
    </div>
);

export const CodeViewerSkeleton: React.FC = () => (
    <div className="p-4 space-y-2 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
            <Skeleton height={20} width={200} />
            <Skeleton height={20} width={60} />
        </div>
        <div className="space-y-1">
            {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                    <Skeleton height={18} width={30} />
                    <Skeleton height={18} width={`${40 + Math.random() * 50}%`} />
                </div>
            ))}
        </div>
    </div>
);

export const SettingsSkeleton: React.FC = () => (
    <div className="p-8 space-y-6 animate-fade-in max-w-2xl mx-auto">
        <Skeleton height={32} width="40%" />
        <div className="space-y-4">
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
        </div>
        <Skeleton height={40} width={120} />
    </div>
);

export const SearchSkeleton: React.FC = () => (
    <div className="p-4 space-y-3 animate-fade-in">
        <Skeleton height={40} />
        <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 border border-border-dark rounded-lg space-y-2">
                    <Skeleton height={16} width="40%" />
                    <Skeleton height={20} width="80%" />
                </div>
            ))}
        </div>
    </div>
);
