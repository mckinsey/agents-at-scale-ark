#!/bin/bash
mkdir -p certs
kubectl get secret cert-manager-webhook-ca -o jsonpath='{.data.tls\.crt}' -n cert-manager | base64 --decode > certs/tls.crt
kubectl get secret cert-manager-webhook-ca -o jsonpath='{.data.tls\.key}' -n cert-manager | base64 --decode > certs/tls.key
kubectl get secret cert-manager-webhook-ca -o jsonpath='{.data.ca\.crt}' -n cert-manager | base64 --decode > certs/ca.crt