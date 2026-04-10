"use client";

import { useState } from "react";
import { User, MapPin, Mail, Phone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CustomerDialog } from "./customer-dialog";

export interface CustomerCardProps {
  estimateId: string;
  customer_name: string;
  job_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

export function CustomerCard(props: CustomerCardProps) {
  const [open, setOpen] = useState(false);

  const hasAny =
    props.customer_name || props.job_address || props.customer_email || props.customer_phone;

  return (
    <>
      <Card className="bg-gradient-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-txt-primary">Customer</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(true)}
            className="text-txt-secondary hover:text-txt-primary"
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!hasAny && (
            <p className="text-txt-tertiary">
              No customer details yet. Click Edit to add them.
            </p>
          )}
          {props.customer_name && (
            <Row icon={<User className="h-4 w-4" />}>{props.customer_name}</Row>
          )}
          {props.job_address && (
            <Row icon={<MapPin className="h-4 w-4" />}>{props.job_address}</Row>
          )}
          {props.customer_email && (
            <Row icon={<Mail className="h-4 w-4" />}>{props.customer_email}</Row>
          )}
          {props.customer_phone && (
            <Row icon={<Phone className="h-4 w-4" />}>{props.customer_phone}</Row>
          )}
        </CardContent>
      </Card>

      <CustomerDialog
        estimateId={props.estimateId}
        initial={{
          customer_name: props.customer_name,
          job_address: props.job_address,
          customer_email: props.customer_email,
          customer_phone: props.customer_phone,
        }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-txt-secondary">
      <span className="text-txt-tertiary">{icon}</span>
      <span className="text-txt-primary">{children}</span>
    </div>
  );
}
