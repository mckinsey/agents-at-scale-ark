'use client';

import { CheckCircle } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LogoutPage() {
  useEffect(() => {
    signOut({ redirect: false });
  }, []);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl font-semibold">
            You&apos;ve been signed out
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/">Return to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
